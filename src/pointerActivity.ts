interface PointerPosition {
  clientX: number
  clientY: number
}

let lastPointerPosition: PointerPosition | undefined

export function recordPointerPosition(e: PointerEvent): void {
  lastPointerPosition = { clientX: e.clientX, clientY: e.clientY }
}

export function hasPointerMoved(e: PointerEvent): boolean {
  const previousClientX = lastPointerPosition?.clientX
  const previousClientY = lastPointerPosition?.clientY
  const pointerMovedByPosition = previousClientX !== e.clientX || previousClientY !== e.clientY
  const hasMovementDelta = typeof e.movementX === 'number' || typeof e.movementY === 'number'
  const pointerMovedByDelta = hasMovementDelta && (e.movementX !== 0 || e.movementY !== 0)

  recordPointerPosition(e)
  return pointerMovedByDelta || pointerMovedByPosition
}
