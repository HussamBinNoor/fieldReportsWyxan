package com.wyxan.fieldreports.upload

import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class UploadSchedulerModule(
  reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  private val executor = Executors.newSingleThreadExecutor()

  override fun getName(): String = NAME

  @ReactMethod
  fun enqueue(delayMs: Double) {
    val delay = delayMs.toLong().coerceAtLeast(0L)
    executor.execute {
      val running = isRunning(PRIMARY_WORK)
      enqueueUnique(PRIMARY_WORK, delay, if (running) ExistingWorkPolicy.KEEP else ExistingWorkPolicy.REPLACE)
      if (running && delay == 0L) {
        enqueueUnique(FOLLOW_UP_WORK, 0L, ExistingWorkPolicy.REPLACE)
      }
    }
  }

  @ReactMethod
  fun complete(nextDelayMs: Double) {
    UploadSignals.complete()
    val delay = nextDelayMs.toLong()
    if (delay >= 0L) {
      executor.execute {
        enqueueUnique(FOLLOW_UP_WORK, delay, ExistingWorkPolicy.REPLACE)
      }
    }
  }

  private fun isRunning(uniqueName: String): Boolean {
    return try {
      WorkManager.getInstance(reactApplicationContext)
        .getWorkInfosForUniqueWork(uniqueName)
        .get()
        .any { it.state == WorkInfo.State.RUNNING }
    } catch (_: Exception) {
      false
    }
  }

  private fun enqueueUnique(uniqueName: String, delayMs: Long, policy: ExistingWorkPolicy) {
    val request =
      OneTimeWorkRequestBuilder<UploadWorker>()
        .setInitialDelay(delayMs, TimeUnit.MILLISECONDS)
        .setConstraints(
          Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build(),
        )
        .build()
    WorkManager.getInstance(reactApplicationContext)
      .enqueueUniqueWork(uniqueName, policy, request)
  }

  companion object {
    const val NAME = "UploadScheduler"
    private const val PRIMARY_WORK = "field-reports-upload"
    private const val FOLLOW_UP_WORK = "field-reports-upload-next"
  }
}
