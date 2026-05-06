export function setLastDialBlock(block) {
  try {
    globalThis.__opsLastDialBlock = block || null;
  } catch {
    // ignore
  }
}

export function getLastDialBlock() {
  try {
    return globalThis.__opsLastDialBlock || null;
  } catch {
    return null;
  }
}

export function getLastFollowUpPatchError() {
  try {
    return globalThis.__opsLastFollowUpPatchError || null;
  } catch {
    return null;
  }
}

