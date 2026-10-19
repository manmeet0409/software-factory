import { NextRequest, NextResponse } from 'next/server';
import { testModelConnectivity } from '@/lib/models/service';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { model, variant } = body as { model?: string; variant?: string };

    if (!model || typeof model !== 'string') {
      return NextResponse.json({ error: 'Model name is required' }, { status: 400 });
    }

    const result = await testModelConnectivity(model, variant);
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Model test error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to test model',
        latencyMs: 0,
      },
      { status: 500 }
    );
  }
}
