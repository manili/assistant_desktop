export interface ParsedBlock {
  type: "text" | "command" | "write_file" | "patch_file";
  content: string;
  fileName?: string;
}

/**
 * Sequential lookbehind-free parser for Multi-Tag Agent responses.
 */
export function parseAgentOutput(text: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  let currentIndex = 0;

  while (currentIndex < text.length) {
    const cmdStartTag = "<execute_command>";
    const cmdEndTag = "</execute_command>";
    const fileStartTag = '<write_file file_name="';
    const fileEndTag = "</write_file>";
    const patchStartTag = '<patch_file file_name="';
    const patchEndTag = "</patch_file>";

    const cmdIdx = text.indexOf(cmdStartTag, currentIndex);
    const fileIdx = text.indexOf(fileStartTag, currentIndex);
    const patchIdx = text.indexOf(patchStartTag, currentIndex);

    // Case 1: No tags found
    if (cmdIdx === -1 && fileIdx === -1 && patchIdx === -1) {
      blocks.push({ type: "text", content: text.substring(currentIndex) });
      break;
    }

    // Identify which tag occurs first in the sequence
    let earliestIdx = Infinity;
    let earliestTagType: "command" | "write_file" | "patch_file" = "command";

    if (cmdIdx !== -1 && cmdIdx < earliestIdx) {
      earliestIdx = cmdIdx;
      earliestTagType = "command";
    }
    if (fileIdx !== -1 && fileIdx < earliestIdx) {
      earliestIdx = fileIdx;
      earliestTagType = "write_file";
    }
    if (patchIdx !== -1 && patchIdx < earliestIdx) {
      earliestIdx = patchIdx;
      earliestTagType = "patch_file";
    }

    // Push any preceding plain text
    if (earliestIdx > currentIndex) {
      blocks.push({
        type: "text",
        content: text.substring(currentIndex, earliestIdx),
      });
    }

    // Process matched block
    if (earliestTagType === "command") {
      const endIdx = text.indexOf(cmdEndTag, earliestIdx + cmdStartTag.length);
      if (endIdx === -1) {
        blocks.push({
          type: "command",
          content: text.substring(earliestIdx + cmdStartTag.length),
        });
        break;
      }
      blocks.push({
        type: "command",
        content: text.substring(earliestIdx + cmdStartTag.length, endIdx),
      });
      currentIndex = endIdx + cmdEndTag.length;
    } else if (earliestTagType === "write_file") {
      const nameStartIdx = earliestIdx + fileStartTag.length;
      const nameEndIdx = text.indexOf('"', nameStartIdx);
      if (nameEndIdx === -1) {
        blocks.push({ type: "text", content: text.substring(earliestIdx) });
        break;
      }
      const fileName = text.substring(nameStartIdx, nameEndIdx);
      const contentStartIdx = text.indexOf(">", nameEndIdx) + 1;
      if (contentStartIdx === 0) {
        blocks.push({ type: "text", content: text.substring(earliestIdx) });
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
    } else if (earliestTagType === "patch_file") {
      const nameStartIdx = earliestIdx + patchStartTag.length;
      const nameEndIdx = text.indexOf('"', nameStartIdx);
      if (nameEndIdx === -1) {
        blocks.push({ type: "text", content: text.substring(earliestIdx) });
        break;
      }
      const fileName = text.substring(nameStartIdx, nameEndIdx);
      const contentStartIdx = text.indexOf(">", nameEndIdx) + 1;
      if (contentStartIdx === 0) {
        blocks.push({ type: "text", content: text.substring(earliestIdx) });
        break;
      }
      const endIdx = text.indexOf(patchEndTag, contentStartIdx);
      if (endIdx === -1) {
        blocks.push({
          type: "patch_file",
          fileName,
          content: text.substring(contentStartIdx),
        });
        break;
      }
      blocks.push({
        type: "patch_file",
        fileName,
        content: text.substring(contentStartIdx, endIdx),
      });
      currentIndex = endIdx + patchEndTag.length;
    }
  }

  return blocks;
}
