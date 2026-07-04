export async function registerFace(
  username: string,
  descriptor: Float32Array,
): Promise<{ success: true }> {
  await new Promise((resolve) => setTimeout(resolve, 700));
  console.info("[dummy] registerFace", {
    username,
    descriptorLength: descriptor.length,
  });
  return { success: true };
}
