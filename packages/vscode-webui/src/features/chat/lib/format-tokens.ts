export function formatTokens(tokens: number | null | undefined): string {
  if (tokens == null || tokens === 0) {
    return "0";
  }

  const k = 1000;
  const m = k * 1000;
  const g = m * 1000;

  let value: number;
  let unit: string;

  if (tokens >= g) {
    value = tokens / g;
    unit = "G";
  } else if (tokens >= m) {
    value = tokens / m;
    unit = "M";
  } else if (tokens >= k) {
    value = tokens / k;
    unit = "k";
  } else {
    return tokens.toString();
  }

  const formattedValue = value.toFixed(1).replace(/\.0$/, "");
  return `${formattedValue}${unit}`;
}
