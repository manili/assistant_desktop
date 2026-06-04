export interface ParsedBlock {
  type: "text" | "command" | "write_file";
  content: string;
  fileName?: string;
}

/**
 * Parses assistant responses containing both terminal command execution
 * and file modification tags. Avoids Lookbehind regex to support Safari 14 (macOS Big Sur).
 */
export function parseAgentOutput(text: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  let currentIndex = 0;

  while (currentIndex < text.length) {
    const cmdStartTag = "<execute_command>";
    const cmdEndTag = "</execute_command>";
    const fileStartTag = '<write_file file_name="';
    const fileEndTag = "</write_file>";

    const cmdIdx = text.indexOf(cmdStartTag, currentIndex);
    const fileIdx = text.indexOf(fileStartTag, currentIndex);

    // Case 1: No tags found
    if (cmdIdx === -1 && fileIdx === -1) {
      blocks.push({ type: "text", content: text.substring(currentIndex) });
      break;
    }

    // Case 2: Terminal Command block occurs first
    if (cmdIdx !== -1 && (fileIdx === -1 || cmdIdx < fileIdx)) {
      if (cmdIdx > currentIndex) {
        blocks.push({
          type: "text",
          content: text.substring(currentIndex, cmdIdx),
        });
      }

      const endIdx = text.indexOf(cmdEndTag, cmdIdx + cmdStartTag.length);
      if (endIdx === -1) {
        blocks.push({
          type: "command",
          content: text.substring(cmdIdx + cmdStartTag.length),
        });
        break;
      }

      blocks.push({
        type: "command",
        content: text.substring(cmdIdx + cmdStartTag.length, endIdx),
      });

      currentIndex = endIdx + cmdEndTag.length;
    }
    // Case 3: File Modification block occurs first
    else {
      if (fileIdx > currentIndex) {
        blocks.push({
          type: "text",
          content: text.substring(currentIndex, fileIdx),
        });
      }

      // Find the ending quote of file_name="filename"
      const nameStartIdx = fileIdx + fileStartTag.length;
      const nameEndIdx = text.indexOf('"', nameStartIdx);

      if (nameEndIdx === -1) {
        // Tag incomplete during stream
        blocks.push({ type: "text", content: text.substring(fileIdx) });
        break;
      }

      const fileName = text.substring(nameStartIdx, nameEndIdx);
      const contentStartIdx = text.indexOf(">", nameEndIdx) + 1;

      if (contentStartIdx === 0) {
        blocks.push({ type: "text", content: text.substring(fileIdx) });
        break;
      }

      const endIdx = text.indexOf(fileEndTag, contentStartIdx);
      if (endIdx === -1) {
        blocks.push({
          type: "write_file",
          fileName,
          content: text.substring(contentStartIdx),
        });
        break;
      }

      blocks.push({
        type: "write_file",
        fileName,
        content: text.substring(contentStartIdx, endIdx),
      });

      currentIndex = endIdx + fileEndTag.length;
    }
  }

  return blocks;
}
