import type { ControlElements, PreferenceStore } from './types'
import type { VolumeChangeGuard } from './events'

export function applyControlPreferences(
  video: HTMLVideoElement,
  els: ControlElements,
  preferences: PreferenceStore,
  guard?: VolumeChangeGuard,
): void {
  const snapshot = preferences.getSnapshot()

  /**
   * 应用插件音量偏好到视频元素
   *
   * ⚠️ 关键：必须遵循浏览器自动播放策略
   * 浏览器 autoplay 策略：没有用户交互时，视频必须 muted=true 才能自动播放
   * 如果在 userInteracted=false 时把 muted 改成 false，浏览器会阻止播放，
   * 视频会暂停并显示中间的大播放按钮！
   *
   * 所以 muted 的修改分情况：
   *  ① snapshot.muted = true（要强制静音）：无论交互过没都允许（不会阻止自动播放）
   *  ② snapshot.muted = false（要解除静音）：必须 userInteracted=true 才允许
   *
   * volume 的修改也分情况：
   *  - 只在 userInteracted=true 时修改数值，避免触发浏览器的自动播放锁
   */
  const needsVolume =
    snapshot.userInteracted && !snapshot.muted && Math.abs(snapshot.volume - video.volume) > 0.0001

  // muted 修改：只有两种情况才真正改
  //   1. 要强制静音（snapshot.muted=true）——任何时候都安全
  //   2. 要解除静音（snapshot.muted=false）——必须用户交互过
  const allowUnmute = snapshot.userInteracted
  const needsMuted = video.muted !== snapshot.muted && (snapshot.muted || allowUnmute)

  const totalChanges = (needsVolume ? 1 : 0) + (needsMuted ? 1 : 0)
  if (guard && totalChanges > 0) {
    guard.skipNextVolumeChanges += totalChanges
  }
  if (needsVolume) video.volume = snapshot.volume
  if (needsMuted) video.muted = snapshot.muted

  video.playbackRate = snapshot.speed
  els.speedBtn.textContent = `${String(snapshot.speed)}\u00D7`
  els.speedOptions.forEach((o) => {
    o.classList.toggle('irc-speed-active', parseFloat(o.dataset.speed ?? '1') === snapshot.speed)
  })
}
