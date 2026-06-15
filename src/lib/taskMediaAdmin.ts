import type { Task, TaskMediaType } from '../types';
import {
  deleteTaskMediaByUrl,
  uploadTaskMedia,
} from './taskMediaStorage';
import type { TaskMediaPickerValue } from '../components/admin/TaskMediaPicker';

export async function resolveTaskMediaForSave(
  taskId: string,
  existingTask: Pick<Task, 'taskMediaUrl' | 'taskMediaType'> | undefined,
  picker: TaskMediaPickerValue,
): Promise<
  | {
      ok: true;
      taskMediaUrl?: string;
      taskMediaType?: TaskMediaType;
    }
  | { ok: false; error: string }
> {
  if (picker.pendingFile && picker.pendingMediaType) {
    if (existingTask?.taskMediaUrl) {
      await deleteTaskMediaByUrl(existingTask.taskMediaUrl);
    }
    const uploaded = await uploadTaskMedia(
      taskId,
      picker.pendingFile,
      picker.pendingMediaType,
    );
    if (!uploaded.ok) return uploaded;
    return {
      ok: true,
      taskMediaUrl: uploaded.url,
      taskMediaType: uploaded.mediaType,
    };
  }

  if (picker.removeExisting) {
    if (existingTask?.taskMediaUrl) {
      const removed = await deleteTaskMediaByUrl(existingTask.taskMediaUrl);
      if (!removed.ok) return removed;
    }
    return { ok: true, taskMediaUrl: undefined, taskMediaType: undefined };
  }

  return {
    ok: true,
    taskMediaUrl: existingTask?.taskMediaUrl,
    taskMediaType: existingTask?.taskMediaType,
  };
}
