import { NextRequest, NextResponse } from 'next/server';
import {
  getModelCatalogWithVariants,
  getAgentModelsConfig,
  getActiveOrchestratorModel,
  updateAgentModels,
  overrideSessionModel,
  type AgentModelConfig,
} from '@/lib/models/service';
import { eventBus } from '@/lib/orchestrator/events';

export async function GET() {
  try {
    const [modelCatalog, config, activeOrch] = await Promise.all([
      getModelCatalogWithVariants(),
      Promise.resolve(getAgentModelsConfig()),
      Promise.resolve(getActiveOrchestratorModel()),
    ]);

    return NextResponse.json({
      availableModels: modelCatalog.availableModels,
      modelVariants: modelCatalog.modelVariants,
      agentModels: config.agentModels,
      agentVariants: config.agentVariants,
      activeOrchestratorModel: activeOrch.model,
      activeOrchestratorVariant: activeOrch.variant,
      activeOrchestratorFullModel: activeOrch.fullModel,
    });
  } catch (error: unknown) {
    console.error('Failed to get models config:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to retrieve models' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      activeOrchestratorModel,
      activeOrchestratorVariant,
      agentModels,
      agentVariants,
    } = body as {
      activeOrchestratorModel?: string;
      activeOrchestratorVariant?: string;
      agentModels?: Partial<AgentModelConfig>;
      agentVariants?: Record<string, string>;
    };

    let newSessionId: string | undefined;

    // 1. If activeOrchestratorModel is passed, prioritize setting and resetting session
    if (activeOrchestratorModel) {
      newSessionId = await overrideSessionModel(
        activeOrchestratorModel,
        activeOrchestratorVariant
      );
    } else if (agentModels?.orchestrator) {
      newSessionId = await overrideSessionModel(
        agentModels.orchestrator,
        agentVariants?.orchestrator
      );
    }

    // 2. Persist configurations for all agents
    if (agentModels || agentVariants) {
      updateAgentModels(agentModels || {}, agentVariants);
    }

    const { agentModels: updatedAgentModels, agentVariants: updatedAgentVariants } =
      getAgentModelsConfig();
    const updatedActive = getActiveOrchestratorModel();

    eventBus.emitEvent('model:updated', {
      activeOrchestratorModel: updatedActive.model,
      activeOrchestratorVariant: updatedActive.variant,
      activeOrchestratorFullModel: updatedActive.fullModel,
      agentModels: updatedAgentModels,
      agentVariants: updatedAgentVariants,
      sessionId: newSessionId,
    });

    return NextResponse.json({
      success: true,
      agentModels: updatedAgentModels,
      agentVariants: updatedAgentVariants,
      activeOrchestratorModel: updatedActive.model,
      activeOrchestratorVariant: updatedActive.variant,
      activeOrchestratorFullModel: updatedActive.fullModel,
      sessionId: newSessionId,
    });
  } catch (error: unknown) {
    console.error('Failed to update models config:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update models' },
      { status: 500 }
    );
  }
}
