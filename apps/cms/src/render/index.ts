// Template ingestion + rendering (PRD Module 4). Pure: inject a DOM parser (DOMParser / linkedom).
export { parseTemplate, TemplateParseError, type IParsedTemplate } from "./parse";
export { renderPost, postUrlFromTemplate, stripUnsafe, type IRenderHeld, type IRenderInput, type IRenderResult } from "./render";
export { analyze, selectorOf, srcsetPattern, structureMap, type IStructure, type IStructureEntry, type ISrcsetPattern, type TParseHtml } from "./structure";
export { placeholderSvg } from "./placeholder";
export * from "./bundle";
