package com.runcrew.gps

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * React Native package registration for the GPSTracker native module.
 *
 * This class must be registered in the application's getPackages() list,
 * typically in MainApplication.kt:
 *
 *   override fun getPackages(): List<ReactPackage> =
 *       PackageList(this).packages.apply {
 *           add(GPSTrackerPackage())
 *       }
 */
class GPSTrackerPackage : ReactPackage {

    override fun createNativeModules(
        reactContext: ReactApplicationContext
    ): List<NativeModule> {
        return listOf(GPSTrackerModule(reactContext))
    }

    override fun createViewManagers(
        reactContext: ReactApplicationContext
    ): List<ViewManager<*, *>> {
        return emptyList()
    }
}
