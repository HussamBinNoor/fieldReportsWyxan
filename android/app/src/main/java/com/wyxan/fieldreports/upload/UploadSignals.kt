package com.wyxan.fieldreports.upload

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

object UploadSignals {
  private val latch = AtomicReference<CountDownLatch?>(null)

  fun prepare() {
    latch.set(CountDownLatch(1))
  }

  fun await(timeoutMs: Long): Boolean {
    val current = latch.get() ?: return false
    return current.await(timeoutMs, TimeUnit.MILLISECONDS)
  }

  fun complete() {
    latch.getAndSet(null)?.countDown()
  }
}
