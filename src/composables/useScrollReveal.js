import { onBeforeUnmount, onMounted, ref } from 'vue'

export function useScrollReveal(options = {}) {
  const targetRef = ref(null)
  const isVisible = ref(false)
  let observer = null

  onMounted(() => {
    observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          isVisible.value = true
          observer?.disconnect()
        }
      },
      {
        threshold: options.threshold ?? 0.18,
        rootMargin: options.rootMargin ?? '0px 0px -8% 0px',
      }
    )

    if (targetRef.value) observer.observe(targetRef.value)
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
  })

  return {
    targetRef,
    isVisible,
  }
}
