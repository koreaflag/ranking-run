#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(MetronomeModule, NSObject)

RCT_EXTERN_METHOD(start:(double)bpm)
RCT_EXTERN_METHOD(stop)
RCT_EXTERN_METHOD(setBPM:(double)bpm)
RCT_EXTERN_METHOD(isPlaying:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(playBeep:(int)count)

@end
