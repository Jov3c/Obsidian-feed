export interface CandidateFeatures {
  textLength: number;
  paragraphCount: number;
  headingCount: number;
  imageCount: number;
  linkTextLength: number;
  linkCount: number;
  buttonCount: number;
  formControlCount: number;
  navLike: boolean;
  footerLike: boolean;
  depth: number;
  semanticRoot: boolean;
  knownWechatRoot: boolean;
}

export function scoreCandidate(features: CandidateFeatures): number {
  return Math.round(
    Math.min(features.textLength / 100, 80) * 10 +
      Math.min(features.paragraphCount, 40) * 8 +
      Math.min(features.headingCount, 10) * 4 +
      Math.min(features.imageCount, 20) * 2 -
      Math.min(features.linkCount, 30) * 3 -
      (features.linkTextLength / Math.max(features.textLength, 1)) * 100 -
      Math.min(features.buttonCount, 10) * 15 -
      Math.min(features.formControlCount, 10) * 20 -
      (features.navLike ? 80 : 0) -
      (features.footerLike ? 60 : 0) +
      (features.semanticRoot ? 25 : 0) +
      (features.knownWechatRoot ? 100 : 0),
  );
}
