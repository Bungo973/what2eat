import {
  CatalogIndex,
  KnowledgeRepo,
  RecipeSearchService,
  ToolError,
  defaultKnowledgeDir,
  validateKnowledge,
} from "@what2eat/recipe-domain";

export interface ServiceContext {
  repo: KnowledgeRepo;
  catalog: CatalogIndex;
  search: RecipeSearchService;
  knowledgeDir: string;
}

/** 启动时构建服务上下文；知识库校验失败即拒绝启动（PRD §9.5）。 */
export function buildContext(knowledgeDir = defaultKnowledgeDir()): ServiceContext {
  const repo = new KnowledgeRepo(knowledgeDir);
  const check = validateKnowledge(repo);
  if (!check.ok) {
    throw new ToolError(
      "DATA_INVALID",
      `知识库校验失败，拒绝启动:\n${check.problems.join("\n")}`,
    );
  }
  const catalog = new CatalogIndex(repo.loadCatalog());
  const search = new RecipeSearchService(repo, catalog);
  return { repo, catalog, search, knowledgeDir };
}
