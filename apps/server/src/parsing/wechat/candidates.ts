import {
  attribute,
  descendants,
  hasClass,
  isElement,
  textContent,
  type DomElement,
  type DomNode,
} from "../dom.js";
import { scoreCandidate, type CandidateFeatures } from "./score.js";

const candidateTags = new Set(["article", "main", "section", "div"]);

export interface ScoredCandidate {
  element: DomElement;
  features: CandidateFeatures;
  score: number;
}

function features(element: DomElement, depth: number): CandidateFeatures {
  const nodes = descendants(element);
  const elements = nodes.filter(isElement);
  const textLength = textContent(element).replace(/\s+/gu, "").length;
  const links = elements.filter((item) => item.tagName === "a");
  const id = attribute(element, "id") ?? "";
  const className = attribute(element, "class") ?? "";
  return {
    textLength,
    paragraphCount: elements.filter((item) => item.tagName === "p").length,
    headingCount: elements.filter((item) => /^h[1-6]$/u.test(item.tagName)).length,
    imageCount: elements.filter((item) => item.tagName === "img").length,
    linkTextLength: links.reduce(
      (total, item) => total + textContent(item).replace(/\s+/gu, "").length,
      0,
    ),
    linkCount: links.length,
    buttonCount: elements.filter((item) => item.tagName === "button").length,
    formControlCount: elements.filter((item) =>
      new Set(["form", "input", "select", "textarea"]).has(item.tagName),
    ).length,
    navLike:
      element.tagName === "nav" || /(^|[-_\s])nav(igation)?($|[-_\s])/iu.test(`${id} ${className}`),
    footerLike: element.tagName === "footer" || /footer|copyright/iu.test(`${id} ${className}`),
    depth,
    semanticRoot: element.tagName === "article" || element.tagName === "main",
    knownWechatRoot: id === "js_content" || hasClass(element, "rich_media_content"),
  };
}

export function findCandidates(root: DomNode): ScoredCandidate[] {
  const result: ScoredCandidate[] = [];
  const visit = (node: DomNode, depth: number) => {
    if (isElement(node) && candidateTags.has(node.tagName)) {
      const candidateFeatures = features(node, depth);
      if (
        candidateFeatures.textLength >= 80 ||
        candidateFeatures.imageCount >= 2 ||
        candidateFeatures.knownWechatRoot
      ) {
        result.push({
          element: node,
          features: candidateFeatures,
          score: scoreCandidate(candidateFeatures),
        });
      }
    }
    if ("childNodes" in node) node.childNodes.forEach((child) => visit(child, depth + 1));
  };
  visit(root, 0);
  return result.sort(
    (left, right) => right.score - left.score || right.features.depth - left.features.depth,
  );
}

export function selectWechatCandidate(root: DomNode): ScoredCandidate | null {
  const candidates = findCandidates(root);
  return (
    candidates.find((candidate) => candidate.features.knownWechatRoot) ??
    candidates.find((candidate) => candidate.score >= 60) ??
    candidates[0] ??
    null
  );
}

export function selectGenericCandidate(root: DomNode): ScoredCandidate | null {
  const candidates = findCandidates(root);
  return candidates.find((candidate) => candidate.features.semanticRoot) ?? candidates[0] ?? null;
}
