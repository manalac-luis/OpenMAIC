// Modified by Gigabox Research (2026)
// GET/POST /api/progress — per-user classroom progress

import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/auth/middleware';
import {
  getProgress,
  getAllProgress,
  upsertProgress,
  markSceneComplete,
  getSceneCompletions,
} from '@/lib/db/queries';

export async function GET(request: NextRequest) {
  const { user } = await authenticateRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const classroomId = request.nextUrl.searchParams.get('classroom_id');

  if (classroomId) {
    const progress = await getProgress(user.id, classroomId);
    const completions = await getSceneCompletions(user.id, classroomId);
    return NextResponse.json({ progress, completions });
  }

  // Return all progress for this user
  const allProgress = await getAllProgress(user.id);
  return NextResponse.json({ progress: allProgress });
}

export async function POST(request: NextRequest) {
  const { user } = await authenticateRequest(request);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json();
  const { classroom_id, current_scene, completed, scene_complete } = body;

  if (!classroom_id) {
    return NextResponse.json({ error: 'classroom_id required' }, { status: 400 });
  }

  // Mark a scene as complete
  if (scene_complete !== undefined) {
    await markSceneComplete(user.id, classroom_id, scene_complete);
  }

  // Update overall progress
  if (current_scene !== undefined || completed !== undefined) {
    const existing = await getProgress(user.id, classroom_id);
    await upsertProgress(
      user.id,
      classroom_id,
      current_scene ?? existing?.current_scene ?? 0,
      completed ?? existing?.completed ?? false,
    );
  }

  return NextResponse.json({ success: true });
}
