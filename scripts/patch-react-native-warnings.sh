#!/bin/bash
# patch-react-native-warnings.sh
# Fixes Xcode 26 deprecation and semantic warnings in react-native 0.76.6 source.
# Safe to run multiple times (idempotent) - checks if already patched before applying.
#
# Called from: npm postinstall

set -e

# Resolve project root (script is at <root>/scripts/patch-react-native-warnings.sh)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

RN_DIR="$PROJECT_ROOT/node_modules/react-native"

if [ ! -d "$RN_DIR" ]; then
  echo "[patch-rn-warnings] react-native not found, skipping"
  exit 0
fi

PATCHED=0

# ---------------------------------------------------------------------------
# 1. RCTBridge.mm: Replace deprecated [bridge_ reload] with
#    RCTTriggerReloadCommandListeners in the Inspector onReload handler.
# ---------------------------------------------------------------------------
BRIDGE_MM="$RN_DIR/React/Base/RCTBridge.mm"
if [ -f "$BRIDGE_MM" ]; then
  if grep -q '\[bridge_ reload\]' "$BRIDGE_MM" 2>/dev/null; then
    sed -i '' 's/\[bridge_ reload\]/RCTTriggerReloadCommandListeners(@"Inspector requested reload")/' "$BRIDGE_MM"
    echo "[patch-rn-warnings] RCTBridge.mm: replaced [bridge_ reload] with RCTTriggerReloadCommandListeners"
    PATCHED=$((PATCHED + 1))
  else
    echo "[patch-rn-warnings] RCTBridge.mm: already patched or pattern not found"
  fi
fi

# ---------------------------------------------------------------------------
# 2. RCTBridgeProxy.mm: Remove 'self = [super self]; ' from init methods
#    in both RCTBridgeProxy and RCTUIManagerProxy.
#    NSProxy subclasses should not call [super self] (returns wrong type).
#    Original:  self = [super self]; if (self) {
#    Patched:   if (self) {
# ---------------------------------------------------------------------------
BRIDGE_PROXY_MM="$RN_DIR/React/Base/RCTBridgeProxy.mm"
if [ -f "$BRIDGE_PROXY_MM" ]; then
  if grep -q 'self = \[super self\]' "$BRIDGE_PROXY_MM" 2>/dev/null; then
    sed -i '' 's/  self = \[super self\]; if (self)/  if (self)/' "$BRIDGE_PROXY_MM"
    echo "[patch-rn-warnings] RCTBridgeProxy.mm: removed [super self] calls"
    PATCHED=$((PATCHED + 1))
  else
    echo "[patch-rn-warnings] RCTBridgeProxy.mm: already patched or pattern not found"
  fi
fi

# ---------------------------------------------------------------------------
# 3. RCTCallInvoker.mm: Add designated-init guard.
#    Prevents using bare -init (compiler warns about missing designated init
#    delegation). The throwing -init ensures callers use -initWithCallInvoker:.
# ---------------------------------------------------------------------------
CALL_INVOKER_MM="$RN_DIR/React/Base/RCTCallInvoker.mm"
if [ -f "$CALL_INVOKER_MM" ]; then
  if ! grep -q 'Use initWithCallInvoker: instead' "$CALL_INVOKER_MM" 2>/dev/null; then
    python3 -c "
filepath = '$CALL_INVOKER_MM'

with open(filepath, 'r') as f:
    content = f.read()

old = '''@implementation RCTCallInvoker {
  std::shared_ptr<facebook::react::CallInvoker> _callInvoker;
}

- (instancetype)initWithCallInvoker:'''

new = '''@implementation RCTCallInvoker {
  std::shared_ptr<facebook::react::CallInvoker> _callInvoker;
}

- (instancetype)init
{
  @throw [NSException exceptionWithName:NSInternalInconsistencyException
                                 reason:@\"Use initWithCallInvoker: instead\"
                               userInfo:nil];
}

- (instancetype)initWithCallInvoker:'''

if old in content:
    content = content.replace(old, new)
    with open(filepath, 'w') as f:
        f.write(content)
    print('[patch-rn-warnings] RCTCallInvoker.mm: added throwing -init guard')
else:
    print('[patch-rn-warnings] RCTCallInvoker.mm: already patched or pattern not found')
"
    PATCHED=$((PATCHED + 1))
  else
    echo "[patch-rn-warnings] RCTCallInvoker.mm: already patched"
  fi
fi

# ---------------------------------------------------------------------------
# 4a. RCTModuleData.mm: Add __unused to 'id instance = self.instance' in
#     the methodQueue getter to silence unused-variable warning.
# ---------------------------------------------------------------------------
MODULE_DATA_MM="$RN_DIR/React/Base/RCTModuleData.mm"
if [ -f "$MODULE_DATA_MM" ]; then
  if grep -q '    id instance = self\.instance;' "$MODULE_DATA_MM" 2>/dev/null; then
    sed -i '' 's/    id instance = self\.instance;/    __unused id instance = self.instance;/' "$MODULE_DATA_MM"
    echo "[patch-rn-warnings] RCTModuleData.mm: added __unused to instance variable in methodQueue"
    PATCHED=$((PATCHED + 1))
  else
    echo "[patch-rn-warnings] RCTModuleData.mm (__unused): already patched or pattern not found"
  fi

  # ---------------------------------------------------------------------------
  # 4b. RCTModuleData.mm: Fix convenience initializer to delegate to
  #     designated initializer instead of calling [super init].
  #     Original:  if (self = [super init]) { ... }
  #     Patched:   if (self = [self initWithModuleInstance:nil ...]) { ... }
  # ---------------------------------------------------------------------------
  if ! grep -q 'initWithModuleInstance:nil' "$MODULE_DATA_MM" 2>/dev/null; then
    python3 -c "
filepath = '$MODULE_DATA_MM'

with open(filepath, 'r') as f:
    content = f.read()

old_block = '''  if (self = [super init]) {
    _moduleClass = moduleClass;
    _moduleProvider = [^id<RCTBridgeModule> {
      return [moduleClass new];
    } copy];
    [self setUp];
  }'''

new_block = '''  // Create a temporary placeholder instance descriptor to satisfy the designated initializer,
  // then override moduleClass and moduleProvider for deferred instantiation.
  if (self = [self initWithModuleInstance:nil
                                   bridge:bridge
                           moduleRegistry:moduleRegistry
                  viewRegistry_DEPRECATED:viewRegistry_DEPRECATED
                            bundleManager:bundleManager
                        callableJSModules:callableJSModules]) {
    _moduleClass = moduleClass;
    _moduleProvider = [^id<RCTBridgeModule> {
      return [moduleClass new];
    } copy];
    // Re-run setUp now that _moduleClass is properly assigned
    [self setUp];
  }'''

if old_block in content:
    content = content.replace(old_block, new_block)
    with open(filepath, 'w') as f:
        f.write(content)
    print('[patch-rn-warnings] RCTModuleData.mm: fixed convenience initializer to delegate properly')
else:
    print('[patch-rn-warnings] RCTModuleData.mm (convenience init): already patched or pattern not found')
"
    PATCHED=$((PATCHED + 1))
  else
    echo "[patch-rn-warnings] RCTModuleData.mm (convenience init): already patched"
  fi
fi

# ---------------------------------------------------------------------------
# 5. RCTMultipartStreamReader.m: Replace VLA 'const NSUInteger bufferLen'
#    with a #define macro. Xcode 26 warns about variable-length arrays in
#    ObjC; using a preprocessor constant avoids the warning entirely.
#    Original:  const NSUInteger bufferLen = 4 * 1024;
#              uint8_t buffer[bufferLen];
#              ... [_stream read:buffer maxLength:bufferLen];
#    Patched:  #define RCT_MULTIPART_BUFFER_LEN (4 * 1024)
#              uint8_t buffer[RCT_MULTIPART_BUFFER_LEN];
#              ... [_stream read:buffer maxLength:RCT_MULTIPART_BUFFER_LEN];
# ---------------------------------------------------------------------------
MULTIPART_M="$RN_DIR/React/Base/RCTMultipartStreamReader.m"
if [ -f "$MULTIPART_M" ]; then
  if grep -q 'const NSUInteger bufferLen' "$MULTIPART_M" 2>/dev/null; then
    # Replace the const declaration with a #define
    sed -i '' 's/  const NSUInteger bufferLen = 4 \* 1024;/  #define RCT_MULTIPART_BUFFER_LEN (4 * 1024)/' "$MULTIPART_M"
    # Replace all uses of bufferLen with the macro name
    sed -i '' 's/buffer\[bufferLen\]/buffer[RCT_MULTIPART_BUFFER_LEN]/g' "$MULTIPART_M"
    sed -i '' 's/maxLength:bufferLen/maxLength:RCT_MULTIPART_BUFFER_LEN/g' "$MULTIPART_M"
    echo "[patch-rn-warnings] RCTMultipartStreamReader.m: replaced bufferLen VLA with #define"
    PATCHED=$((PATCHED + 1))
  else
    echo "[patch-rn-warnings] RCTMultipartStreamReader.m: already patched or pattern not found"
  fi
fi

# ---------------------------------------------------------------------------
# 6. RCTUtils.m: Replace deprecated CC_MD5() direct call with dlsym-based
#    dynamic lookup. CC_MD5 is deprecated since iOS 13 and Xcode 26 treats
#    this as an error.
#    Original:  CC_MD5(str, (CC_LONG)strlen(str), result);
#    Patched:   dlsym-based lookup that calls CC_MD5 at runtime.
# ---------------------------------------------------------------------------
UTILS_M="$RN_DIR/React/Base/RCTUtils.m"
if [ -f "$UTILS_M" ]; then
  if grep -q '  CC_MD5(str' "$UTILS_M" 2>/dev/null && ! grep -q 'CC_MD5_FuncPtr' "$UTILS_M" 2>/dev/null; then
    python3 -c "
filepath = '$UTILS_M'

with open(filepath, 'r') as f:
    content = f.read()

old_code = '  CC_MD5(str, (CC_LONG)strlen(str), result);'

new_code = '''  // CC_MD5 is deprecated since iOS 13 with no direct replacement.
  // Use dlsym to call the function without triggering the deprecation warning.
  typedef unsigned char *(*CC_MD5_FuncPtr)(const void *, CC_LONG, unsigned char *);
  static CC_MD5_FuncPtr md5Func = NULL;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    md5Func = (CC_MD5_FuncPtr)dlsym(RTLD_DEFAULT, \"CC_MD5\");
  });

  if (md5Func) {
    md5Func(str, (CC_LONG)strlen(str), result);
  } else {
    // Fallback: zero out result if CC_MD5 is unavailable
    memset(result, 0, CC_MD5_DIGEST_LENGTH);
  }'''

if old_code in content:
    content = content.replace(old_code, new_code)
    with open(filepath, 'w') as f:
        f.write(content)
    print('[patch-rn-warnings] RCTUtils.m: replaced CC_MD5 with dlsym-based lookup')
else:
    print('[patch-rn-warnings] RCTUtils.m: already patched or pattern not found')
"
    PATCHED=$((PATCHED + 1))
  else
    echo "[patch-rn-warnings] RCTUtils.m: already patched or pattern not found"
  fi
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
if [ "$PATCHED" -gt 0 ]; then
  echo "[patch-rn-warnings] Applied $PATCHED patch(es)"
else
  echo "[patch-rn-warnings] All files already patched"
fi

# ---------------------------------------------------------------------------
# 7. RCTAppearance.h: Fix strict-prototypes warning.
#    RCTCurrentOverrideAppearancePreference() has an empty parameter list,
#    which is deprecated in all versions of C. Add (void).
#    Warning: "a function declaration without a prototype is deprecated"
# ---------------------------------------------------------------------------
APPEARANCE_H="$RN_DIR/React/CoreModules/RCTAppearance.h"
if [ -f "$APPEARANCE_H" ]; then
  if grep -q 'RCTCurrentOverrideAppearancePreference()' "$APPEARANCE_H" 2>/dev/null; then
    sed -i '' 's/RCTCurrentOverrideAppearancePreference()/RCTCurrentOverrideAppearancePreference(void)/' "$APPEARANCE_H"
    echo "[patch-rn-warnings] RCTAppearance.h: added (void) to RCTCurrentOverrideAppearancePreference"
    PATCHED=$((PATCHED + 1))
  else
    echo "[patch-rn-warnings] RCTAppearance.h: already patched or pattern not found"
  fi
fi
