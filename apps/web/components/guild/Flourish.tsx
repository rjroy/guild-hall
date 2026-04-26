const SVG = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='14' viewBox='0 0 200 14'><g fill='none' stroke='%23C9A24A' stroke-width='1.1'><path d='M0 7 L80 7'/><path d='M120 7 L200 7'/><circle cx='100' cy='7' r='3.5'/><path d='M93 7 L88 4 M93 7 L88 10 M107 7 L112 4 M107 7 L112 10'/></g></svg>`;

export default function Flourish() {
  return (
    <div
      role="separator"
      aria-hidden="true"
      style={{
        height: 14,
        margin: "12px auto",
        width: 200,
        background: `center/contain no-repeat url("${SVG}")`,
      }}
    />
  );
}
