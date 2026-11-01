/* 编辑器图片支持：粘贴截图 / 本地上传 → 压缩 → data URI 插入编辑器。
 *
 * ⚠️ 2026-11-02 重要修正（原注释的结论已被实测推翻）：
 *   原注释写「公众号不认 data URI，复制富文本路径图片依然会丢，需要推送后端 uploadimg」。
 *   **这个结论是错的。** 2026-11-01 晚用真实产物实测：把 data:image/jpeg;base64 内嵌图
 *   随富文本粘进公众号后台正文区，**图片正常显示**。
 *   所以不需要推送后端，复制路径就能带图（方案与证据见
 *   docs/design-paste-image-and-typography.md §3.3 与
 *   docs/research-2026-11-01-seneasy-copy-pipeline.md）。
 *
 * 压缩目标随之改变：不再受「微信 uploadimg ≤1MB」约束，而是受**剪贴板体积**约束。
 * 实测句方便 19 张图合计 755KB（≈40KB/张）；我们取 150KB/张、单次上限 8MB，
 * 超过就提示改用「导出长图」——一次性塞几十 MB 进剪贴板会让粘贴卡死。
 *
 * 参数：目标宽 1080（公众号正文显示宽约 677，2x 屏留量）；质量 0.85 起逐级降到 0.5。
 */

// 压缩参数
const MAX_W = 1080;
// 单张目标：150KB。原值 900KB 是为推送 uploadimg 留的，现在走剪贴板不需要那么大。
const MAX_BYTES = 150 * 1024;
const QUALITY_STEPS = [0.85, 0.7, 0.5];

/** 把图片文件压成符合微信限制的 jpeg data URI。gif 原样直通（压缩会丢动画）。 */
export async function fileToDataUri(file) {
  if (file.type === 'image/gif') {
    if (file.size > MAX_BYTES) throw new Error('GIF 超过 900KB，推送时无法转微信图床，请先压缩');
    return blobToDataUri(file);
  }

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_W / bitmap.width);
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    // png 截图常有透明通道，jpeg 不支持 → 先铺白底，避免透明区变黑
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);

    let last = null;
    for (const q of QUALITY_STEPS) {
      const blob = await canvasToBlob(canvas, 'image/jpeg', q);
      last = blob;
      if (blob.size <= MAX_BYTES) return blobToDataUri(blob);
    }
    return blobToDataUri(last);   // 最低质量仍超限也放行：预览/长图可用，推送侧再拦
  } finally {
    bitmap.close();
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob 失败'))),
      type,
      quality,
    );
  });
}

function blobToDataUri(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('读取图片失败'));
    r.readAsDataURL(blob);
  });
}

/** 在 textarea 光标处插入 Markdown 图片，图片独占一段（前后保证空行，否则 python-markdown 不认）。 */
export function insertMarkdownImage(textarea, dataUri) {
  const md = `![](${dataUri})`;
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? start;
  const val = textarea.value;
  const before = val.slice(0, start);
  const after = val.slice(end);

  const nlBefore = before.length === 0 ? ''
    : /\n\n$/.test(before) ? '' : /\n$/.test(before) ? '\n' : '\n\n';
  const nlAfter = after.length === 0 ? ''
    : /^\n\n/.test(after) ? '' : /^\n/.test(after) ? '\n' : '\n\n';

  const piece = nlBefore + md + nlAfter;
  textarea.setRangeText(piece, start, end, 'end');
  textarea.focus();
  return piece.length;
}

/** 批量处理图片文件：压缩 → 插入 → 返回 {ok, fail} 供 toast 汇报。 */
export async function insertImageFiles(files, textarea) {
  const images = [...files].filter((f) => f.type.startsWith('image/'));
  if (!images.length) return { ok: 0, fail: 0, bytes: 0 };

  let ok = 0, fail = 0, bytes = 0;
  for (const f of images) {
    try {
      const dataUri = await fileToDataUri(f);
      insertMarkdownImage(textarea, dataUri);
      ok++;
      bytes += Math.round(dataUri.length * 0.75);   // base64 → 近似字节数
    } catch (err) {
      console.warn('[editor-images] 插入失败:', err);
      fail++;
    }
  }
  return { ok, fail, bytes };
}
