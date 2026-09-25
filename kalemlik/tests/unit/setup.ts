// Tarayıcı olmayan ortam için en küçük tuval ölçüm taklidi (yazı genişliği = karakter sayısı × boyut × 0,5).
const g = globalThis as unknown as {document?: unknown};
if (!g.document) {
  g.document = {
    createElement: () => ({getContext: () => {
      const ctx = {font: '12px x', letterSpacing: '0px', measureText: (t: string) => { const size = Number(/(\d+(?:\.\d+)?)px/.exec(ctx.font)?.[1] || 12); return {width: t.length * size * 0.5, actualBoundingBoxAscent: size * 0.75, actualBoundingBoxDescent: size * 0.2}; }};
      return ctx;
    }}),
  };
}
export {};
