export { FigmaClient } from './FigmaClient.js'
export { parseFigmaFileResponse, figmaRgbaToHex } from './FigmaParser.js'
export { extractTokensFromFigma, mergeExtractedColorsWithDefaults } from './FigmaTokenExtractor.js'
export {
  normalizeFigmaComponents,
  figmaComponentNameToBaseId,
  generateSharedComponentTsx,
  setSharedMapping,
  FIGMA_BASE_IDS,
} from './FigmaComponentNormalizer.js'
export { generatePageFromFrame, generatePagesFromFigma, getPageFilePath } from './FigmaPageGenerator.js'
export type { FigmaClientOptions } from './FigmaClient.js'
export type { FigmaTokenExtractionResult } from './FigmaTokenExtractor.js'
export type { FigmaNormalizationResult, FigmaNormalizedEntry, FigmaBaseId } from './FigmaComponentNormalizer.js'
export type { FigmaComponentMap, GeneratedPage } from './FigmaPageGenerator.js'
