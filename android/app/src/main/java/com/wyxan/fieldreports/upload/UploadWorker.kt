package com.wyxan.fieldreports.upload

import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters

class UploadWorker(
  context: Context,
  params: WorkerParameters,
) : CoroutineWorker(context, params) {
  override suspend fun doWork(): Result {
    UploadSignals.prepare()
    val intent = Intent(applicationContext, UploadHeadlessService::class.java)
    return try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        applicationContext.startForegroundService(intent)
      } else {
        applicationContext.startService(intent)
      }
      if (UploadSignals.await(8 * 60 * 1000L)) Result.success() else Result.retry()
    } catch (_: Exception) {
      Result.retry()
    }
  }
}
