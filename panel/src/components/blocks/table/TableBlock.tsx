import type { ServerBlock } from '../../../schemas/blocks.server';

export function TableBlock({ block }: { block: ServerBlock }) {
  const headers = (block.data.headers as string[]) || [];
  const rows = (block.data.rows as string[][]) || [];
  return (
    <div className="block table-wrap">
      <table>
        {headers.length > 0 ? (
          <thead>
            <tr>{headers.map((h, i) => <th key={i}>{h}</th>)}</tr>
          </thead>
        ) : null}
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
