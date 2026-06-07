import React from "react";

interface MarkdownToken {
  type: "text" | "code_block";
  content: string;
  language?: string;
}

/**
 * A safe, lookbehind-free Markdown compiler designed for compatibility
 * with WebKit (Safari 16/macOS Big Sur). Renders directly to React Nodes.
 */
export function renderMarkdown(text: string): React.ReactNode[] {
  const tokens: MarkdownToken[] = [];
  let currentIndex = 0;

  // 1. Separate code blocks from plain markdown text
  while (currentIndex < text.length) {
    const codeStartIdx = text.indexOf("```", currentIndex);
    if (codeStartIdx === -1) {
      tokens.push({ type: "text", content: text.substring(currentIndex) });
      break;
    }

    if (codeStartIdx > currentIndex) {
      tokens.push({
        type: "text",
        content: text.substring(currentIndex, codeStartIdx),
      });
    }

    const nextNewLineIdx = text.indexOf("\n", codeStartIdx + 3);
    if (nextNewLineIdx === -1) {
      tokens.push({ type: "text", content: text.substring(codeStartIdx) });
      break;
    }

    const language = text.substring(codeStartIdx + 3, nextNewLineIdx).trim();
    const codeEndIdx = text.indexOf("```", nextNewLineIdx + 1);

    if (codeEndIdx === -1) {
      tokens.push({
        type: "code_block",
        content: text.substring(nextNewLineIdx + 1),
        language,
      });
      break;
    }

    tokens.push({
      type: "code_block",
      content: text.substring(nextNewLineIdx + 1, codeEndIdx),
      language,
    });

    currentIndex = codeEndIdx + 3;
  }

  // 2. Render tokens to React structures
  return tokens.map((token, idx) => {
    if (token.type === "code_block") {
      return (
        <div
          key={idx}
          className="my-3 rounded-lg overflow-hidden border border-slate-800 bg-slate-950 font-mono text-[11px] text-slate-200"
        >
          {token.language && (
            <div className="bg-slate-900 px-3 py-1 text-[9px] text-slate-500 font-bold border-b border-slate-850 uppercase select-none">
              {token.language}
            </div>
          )}
          <pre className="p-3 overflow-x-auto whitespace-pre leading-relaxed custom-scrollbar selection:bg-indigo-800/80">
            <code>{token.content}</code>
          </pre>
        </div>
      );
    }

    return (
      <div key={idx} className="space-y-2">
        {parseParagraphsAndLists(token.content)}
      </div>
    );
  });
}

function parseParagraphsAndLists(text: string): React.ReactNode[] {
  const paragraphs = text.split("\n\n");

  return paragraphs.map((p, pIdx) => {
    const trimmed = p.trim();
    if (trimmed.length === 0) return null;

    const lines = trimmed.split("\n");

    // Evaluate if lines form a list block
    const isList = lines.every((line) => {
      const tLine = line.trim();
      return (
        tLine.startsWith("- ") ||
        tLine.startsWith("* ") ||
        /^\d+\.\s/.test(tLine)
      );
    });

    if (isList) {
      const listItems = lines.map((line, lIdx) => {
        // Strip prefix bullets or numbers
        const cleanContent = line.trim().replace(/^(-\s|\*\s|\d+\.\s)/, "");
        return (
          <li key={lIdx} className="text-slate-300 text-xs leading-relaxed">
            {renderInlineStyles(cleanContent)}
          </li>
        );
      });

      const firstLine = lines[0].trim();
      if (/^\d+\.\s/.test(firstLine)) {
        return (
          <ol key={pIdx} className="list-decimal pl-5 my-2 space-y-1">
            {listItems}
          </ol>
        );
      } else {
        return (
          <ul key={pIdx} className="list-disc pl-5 my-2 space-y-1">
            {listItems}
          </ul>
        );
      }
    }

    // Evaluate Header tags
    if (trimmed.startsWith("#")) {
      const match = trimmed.match(/^(#{1,6})\s+(.*)$/);
      if (match) {
        const level = match[1].length;
        const headerText = match[2];
        const sizeClass =
          level === 1
            ? "text-base font-extrabold"
            : level === 2
            ? "text-sm font-bold"
            : "text-xs font-semibold uppercase tracking-wider text-indigo-400";
        return (
          <div key={pIdx} className={`text-slate-200 mt-4 mb-2 ${sizeClass}`}>
            {renderInlineStyles(headerText)}
          </div>
        );
      }
    }

    // Normal Paragraph block
    return (
      <p
        key={pIdx}
        className="text-slate-300 text-xs leading-relaxed whitespace-pre-wrap"
      >
        {renderInlineStyles(p)}
      </p>
    );
  });
}

function renderInlineStyles(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let currentStr = "";
  let i = 0;

  while (i < text.length) {
    // Bold Formatting (Double Asterisks)
    if (text.startsWith("**", i)) {
      if (currentStr) {
        parts.push(currentStr);
        currentStr = "";
      }
      const nextIdx = text.indexOf("**", i + 2);
      if (nextIdx !== -1) {
        parts.push(
          <strong key={i} className="font-bold text-slate-100">
            {text.substring(i + 2, nextIdx)}
          </strong>
        );
        i = nextIdx + 2;
        continue;
      }
    }

    // Inline Code Highlights (Backticks)
    if (text[i] === "`") {
      if (currentStr) {
        parts.push(currentStr);
        currentStr = "";
      }
      const nextIdx = text.indexOf("`", i + 1);
      if (nextIdx !== -1) {
        parts.push(
          <code
            key={i}
            className="bg-slate-950 border border-slate-850 text-indigo-300 px-1 py-0.5 rounded text-[10px] font-mono select-all"
          >
            {text.substring(i + 1, nextIdx)}
          </code>
        );
        i = nextIdx + 1;
        continue;
      }
    }

    // Italics Formatting (Single Asterisk)
    if (text[i] === "*") {
      if (currentStr) {
        parts.push(currentStr);
        currentStr = "";
      }
      const nextIdx = text.indexOf("*", i + 1);
      if (nextIdx !== -1) {
        parts.push(
          <em key={i} className="italic text-slate-200">
            {text.substring(i + 1, nextIdx)}
          </em>
        );
        i = nextIdx + 1;
        continue;
      }
    }

    currentStr += text[i];
    i++;
  }

  if (currentStr) {
    parts.push(currentStr);
  }

  return parts;
}
