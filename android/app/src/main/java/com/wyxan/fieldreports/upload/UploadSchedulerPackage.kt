package com.wyxan.fieldreports.upload

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

class UploadSchedulerPackage : BaseReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
    if (name == UploadSchedulerModule.NAME) {
      return UploadSchedulerModule(reactContext)
    }
    return null
  }

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
    return ReactModuleInfoProvider {
      mapOf(
        UploadSchedulerModule.NAME to
          ReactModuleInfo(
            UploadSchedulerModule.NAME,
            UploadSchedulerModule::class.java.name,
            false,
            false,
            false,
            false,
          ),
      )
    }
  }
}
