// body 每行最大字符数，与 prompt 约定一致（commitlint 默认限制 100，取更严的 72）
export const BODY_MAX_LINE_LENGTH = 72;

/**
 * body 折行：将超长行在标点/空格处断开，列表项续行保持缩进对齐。
 * 首行（header）不处理；阈值 72 与 prompt 约定一致，同时满足 commitlint 默认 100 的限制。
 */
export function wrapBodyLines(
  message: string,
  maxLength: number = BODY_MAX_LINE_LENGTH
): string {
  const result: string[] = [];
  message.split('\n').forEach((line, index) => {
    if (index === 0 || line.length <= maxLength) {
      result.push(line);
    } else {
      result.push(...wrapLine(line, maxLength));
    }
  });
  return result.join('\n');
}

/** 单行折行：列表项提取标记前缀（-、*、1. 等），续行用等宽空格缩进对齐 */
export function wrapLine(line: string, maxLength: number): string[] {
  const prefixMatch = line.match(/^(\s*(?:[-*+]|\d+\.)\s+)/);
  const prefix = prefixMatch?.[1] ?? '';
  const indent = ' '.repeat(prefix.length);

  const chunks: string[] = [];
  let remaining = prefix ? line.slice(prefix.length) : line;
  let first = true;

  while (true) {
    const available = maxLength - (first ? prefix.length : indent.length);
    if (remaining.length <= available) {
      chunks.push((first ? prefix : indent) + remaining);
      break;
    }
    const cut = findBreakPoint(remaining, available);
    chunks.push((first ? prefix : indent) + remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
    first = false;
  }
  return chunks;
}

/**
 * 寻找折行断点：优先在标点或空格之后断开；
 * 切点落在英文单词中间时先回退到单词边界；
 * 单词保护导致切点过小时放弃保护硬切（如超长 URL）。
 */
export function findBreakPoint(text: string, limit: number): number {
  let cut = Math.min(limit, text.length);
  const isWordChar = (ch: string) => /\w/.test(ch);
  if (cut < text.length && isWordChar(text[cut - 1]) && isWordChar(text[cut])) {
    while (cut > 0 && isWordChar(text[cut - 1])) cut--;
  }
  if (cut < limit * 0.3) {
    cut = Math.min(limit, text.length);
  }
  // 在切点前半段之后找最近的标点/空格，断在其后（中文标点留在行尾）
  const minAcceptable = Math.floor(cut * 0.5);
  for (let i = cut; i > minAcceptable; i--) {
    if (' \t，。；、：,.;:!?！？)）】]'.includes(text[i - 1])) {
      return i;
    }
  }
  return Math.max(cut, 1);
}
