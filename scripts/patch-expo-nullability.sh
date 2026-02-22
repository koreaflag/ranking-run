#!/bin/bash
# patch-expo-nullability.sh
# Adds NS_ASSUME_NONNULL_BEGIN/END to expo-modules-core ObjC headers
# that are missing them. Required for Xcode 26 strict nullability checks.
#
# Called from: npm postinstall + Podfile pre_install

set -e

# Resolve project root (script is at <root>/scripts/patch-expo-nullability.sh)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

EXPO_IOS_DIR="$PROJECT_ROOT/node_modules/expo-modules-core/ios"

if [ ! -d "$EXPO_IOS_DIR" ]; then
  echo "[patch-expo-nullability] expo-modules-core not found, skipping"
  exit 0
fi

PATCHED=0

# Files to skip: @protocol/@interface is inside preprocessor conditionals,
# or file has the string NS_ASSUME_NONNULL_BEGIN in a comment (not as pragma).
SKIP_FILES="Platform.h RCTComponentData+Privates.h"

patch_file() {
  local file="$1"

  # Skip if already patched
  if grep -qE "^NS_ASSUME_NONNULL_BEGIN$" "$file" 2>/dev/null; then
    return
  fi

  # Skip files that don't have ObjC declarations (protocols/interfaces)
  if ! grep -qE '^@(protocol|interface) ' "$file" 2>/dev/null; then
    return
  fi

  # Skip known problematic files
  local basename
  basename=$(basename "$file")
  for skip in $SKIP_FILES; do
    if [ "$basename" = "$skip" ]; then
      return
    fi
  done

  # Find line number of first @protocol or @interface
  local first_decl_line
  first_decl_line=$(grep -n -m1 -E '^@(protocol|interface) ' "$file" | cut -d: -f1)

  if [ -z "$first_decl_line" ]; then
    return
  fi

  local insert_line=$((first_decl_line - 1))

  {
    head -n "$insert_line" "$file"
    echo "NS_ASSUME_NONNULL_BEGIN"
    echo ""
    tail -n "+$first_decl_line" "$file"
    echo ""
    echo "NS_ASSUME_NONNULL_END"
  } > "${file}.tmp"

  mv "${file}.tmp" "$file"
  PATCHED=$((PATCHED + 1))
}

# Find all .h files in expo-modules-core/ios
while IFS= read -r -d '' header; do
  patch_file "$header"
done < <(find "$EXPO_IOS_DIR" -name "*.h" -print0)

# Special fix for Platform.h: @protocol is inside #elif TARGET_OS_OSX,
# so NS_ASSUME_NONNULL_BEGIN/END must both be inside that conditional block.
PLATFORM_H="$EXPO_IOS_DIR/Platform.h"
if [ -f "$PLATFORM_H" ]; then
  if grep -q "@protocol UIApplicationDelegate" "$PLATFORM_H" 2>/dev/null; then
    if ! grep -q "NS_ASSUME_NONNULL_BEGIN" "$PLATFORM_H" 2>/dev/null; then
      # Use python for reliable multi-line replacement
      python3 -c "
import re, sys
with open('$PLATFORM_H', 'r') as f:
    content = f.read()
content = content.replace(
    '@protocol UIApplicationDelegate <NSApplicationDelegate> @end',
    'NS_ASSUME_NONNULL_BEGIN\n@protocol UIApplicationDelegate <NSApplicationDelegate> @end\nNS_ASSUME_NONNULL_END'
)
with open('$PLATFORM_H', 'w') as f:
    f.write(content)
"
      PATCHED=$((PATCHED + 1))
    fi
  fi
fi

# ---------------------------------------------------------------------------
# Fix exportedInterfaces return statements in implementation files.
# The protocol declares return type as 'const NSArray<Protocol *> * _Nonnull'
# (via NS_ASSUME_NONNULL in the header), but @[] array literals don't carry
# _Nonnull in ObjC++, causing a hard compilation error.
# Fix: use an intermediate typed variable so the declaration picks up nonnull.
# NOTE: Do NOT wrap @implementation with NS_ASSUME_NONNULL — that causes
# conflicts with methods like copyWithZone:(nullable NSZone *).
# ---------------------------------------------------------------------------
IMPL_FILES=(
  "$EXPO_IOS_DIR/Legacy/Services/EXReactNativeAdapter.mm"
  "$EXPO_IOS_DIR/Legacy/EXUtilities.m"
  "$EXPO_IOS_DIR/Legacy/Services/Permissions/EXPermissionsService.m"
  "$EXPO_IOS_DIR/Legacy/Services/Permissions/EXReactNativeUserNotificationCenterProxy.m"
  "$EXPO_IOS_DIR/Legacy/Services/EXReactNativeEventEmitter.m"
)

for impl_file in "${IMPL_FILES[@]}"; do
  if [ -f "$impl_file" ]; then
    if grep -q 'return @\[@protocol(' "$impl_file" 2>/dev/null; then
      python3 -c "
filepath = '$impl_file'
with open(filepath, 'r') as f:
    content = f.read()
import re
# Replace 'return @[@protocol(...)];' with intermediate variable
pattern = r'([ \t]+)return (@\[@protocol\([^]]+\)\]);'
def repl(m):
    indent = m.group(1)
    arr = m.group(2)
    return f'{indent}NSArray<Protocol *> *ifaces = {arr};\n{indent}return ifaces;'
new_content = re.sub(pattern, repl, content)
if new_content != content:
    with open(filepath, 'w') as f:
        f.write(new_content)
    print(f'[patch-expo-nullability] {filepath.split(\"/\")[-1]}: fixed nonnull return')
"
      PATCHED=$((PATCHED + 1))
    fi
  fi
done

if [ "$PATCHED" -gt 0 ]; then
  echo "[patch-expo-nullability] Patched $PATCHED file(s)"
else
  echo "[patch-expo-nullability] All files already patched"
fi

# ---------------------------------------------------------------------------
# Fix EXDevLauncherAppDelegate.h: Add NS_ASSUME_NONNULL_BEGIN/END around the
# @interface block and fix the block typedef to use (void) parameter list.
# Warnings: "pointer is missing a nullability type specifier" at lines 10-11.
# ---------------------------------------------------------------------------
DEV_LAUNCHER_H="$PROJECT_ROOT/node_modules/expo-dev-launcher/ios/EXDevLauncherAppDelegate.h"
if [ -f "$DEV_LAUNCHER_H" ]; then
  if ! grep -q "NS_ASSUME_NONNULL_BEGIN" "$DEV_LAUNCHER_H" 2>/dev/null; then
    python3 -c "
filepath = '$DEV_LAUNCHER_H'
with open(filepath, 'r') as f:
    content = f.read()

new_content = '''#import <ExpoModulesCore/RCTAppDelegate+Recreate.h>
#import <React/RCTRootView.h>

typedef NSURL * _Nullable (^EXDevLauncherBundleURLGetter)(void);

NS_ASSUME_NONNULL_BEGIN

@interface EXDevLauncherAppDelegate : RCTAppDelegate

@property (nonatomic, copy, nonnull) EXDevLauncherBundleURLGetter bundleURLGetter;

- (instancetype)initWithBundleURLGetter:(nonnull EXDevLauncherBundleURLGetter)bundleURLGetter;
- (RCTRootViewFactory *)createRCTRootViewFactory;

@end

NS_ASSUME_NONNULL_END
'''

with open(filepath, 'w') as f:
    f.write(new_content)
print('[patch-expo-nullability] EXDevLauncherAppDelegate.h: added NS_ASSUME_NONNULL and (void) to block typedef')
"
    PATCHED=$((PATCHED + 1))
  else
    echo "[patch-expo-nullability] EXDevLauncherAppDelegate.h: already patched"
  fi
fi

# ---------------------------------------------------------------------------
# Fix EXJSIUtils.h: Add _Nonnull to PromiseInvocationBlock's block pointer
# parameters. The typedef is inside #ifdef __cplusplus (outside the existing
# NS_ASSUME_NONNULL_BEGIN/END that wraps the @interface section).
# Warning: "block pointer is missing a nullability type specifier" at line 20.
# ---------------------------------------------------------------------------
EXJSI_UTILS_H="$EXPO_IOS_DIR/JSI/EXJSIUtils.h"
if [ -f "$EXJSI_UTILS_H" ]; then
  EXJSI_CHANGED=0

  # Fix 1: Add _Nonnull to PromiseInvocationBlock params (line 20)
  if grep -q 'RCTPromiseResolveBlock resolveWrapper' "$EXJSI_UTILS_H" 2>/dev/null && \
     ! grep -q 'RCTPromiseResolveBlock _Nonnull resolveWrapper' "$EXJSI_UTILS_H" 2>/dev/null; then
    sed -i '' 's/RCTPromiseResolveBlock resolveWrapper, RCTPromiseRejectBlock rejectWrapper/RCTPromiseResolveBlock _Nonnull resolveWrapper, RCTPromiseRejectBlock _Nonnull rejectWrapper/' "$EXJSI_UTILS_H"
    EXJSI_CHANGED=1
  fi

  # Fix 2: Add _Nonnull to callPromiseSetupWithBlock's block pointer param (line 22)
  if grep -q 'PromiseInvocationBlock setupBlock)' "$EXJSI_UTILS_H" 2>/dev/null && \
     ! grep -q 'PromiseInvocationBlock _Nonnull setupBlock)' "$EXJSI_UTILS_H" 2>/dev/null; then
    sed -i '' 's/PromiseInvocationBlock setupBlock)/PromiseInvocationBlock _Nonnull setupBlock)/' "$EXJSI_UTILS_H"
    EXJSI_CHANGED=1
  fi

  # Fix 3: Add _Nonnull to makeCodedError NSString params (line 48)
  if grep -q 'NSString \*code, NSString \*message' "$EXJSI_UTILS_H" 2>/dev/null && \
     ! grep -q 'NSString \* _Nonnull code' "$EXJSI_UTILS_H" 2>/dev/null; then
    sed -i '' 's/NSString \*code, NSString \*message/NSString * _Nonnull code, NSString * _Nonnull message/' "$EXJSI_UTILS_H"
    EXJSI_CHANGED=1
  fi

  if [ "$EXJSI_CHANGED" -gt 0 ]; then
    echo "[patch-expo-nullability] EXJSIUtils.h: added _Nonnull annotations"
    PATCHED=$((PATCHED + 1))
  else
    echo "[patch-expo-nullability] EXJSIUtils.h: already patched or pattern not found"
  fi
fi
