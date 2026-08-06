import { describe, it, expect, vi } from 'vitest';
import { signal } from '@angular/core';
import { render, screen, fireEvent } from '@testing-library/angular';
import { of, throwError, Observable } from 'rxjs';
import { provideTransloco, TranslocoLoader, Translation } from '@jsverse/transloco';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { JobsViewerComponent } from './jobs-viewer.component';
import { ApiService } from '../services/api.service';
import { JobsStore } from '../services/jobs.store';
import { JobState } from '../types';

class InlineLoader implements TranslocoLoader {
  getTranslation(): Observable<Translation> {
    return of({
      jobs: {
        empty: 'No jobs',
        revert: 'Revert',
        recover: 'Recover',
        recovered: 'Recovered',
        files: 'Files',
      },
      common: { cancel: 'Cancel', abandon: 'Abandon' },
    });
  }
}

function job(files: JobState['files']): JobState {
  return {
    id: 'job-1',
    type: 'INGEST',
    status: 'COMPLETED',
    phases: [],
    files,
    conceptProposals: [],
    createdAt: '2026-08-06T10:00:00.000Z',
  };
}

async function renderViewer(store: { jobs: unknown }, api: Partial<ApiService>) {
  return render(JobsViewerComponent, {
    providers: [
      provideNoopAnimations(),
      provideTransloco({
        config: { availableLangs: ['en'], defaultLang: 'en', reRenderOnLangChange: false, prodMode: false },
        loader: InlineLoader,
      }),
      { provide: JobsStore, useValue: store },
      { provide: ApiService, useValue: api },
      { provide: Router, useValue: { navigate: vi.fn() } },
    ],
  });
}

describe('JobsViewerComponent — recover deleted file', () => {
  it('renders a RECOVER button only for delete entries', async () => {
    const store = {
      jobs: signal(new Map([['job-1', job([
        { path: 'wiki/gone.md', action: 'delete' },
        { path: 'wiki/kept.md', action: 'update' },
      ])]])),
    };
    const api = { recoverDeletedFile: vi.fn().mockReturnValue(of(undefined)) };

    await renderViewer(store, api as unknown as Partial<ApiService>);

    // Exactly one recover button — for the single delete entry, not the update entry.
    const recoverButtons = screen.getAllByRole('button', { name: 'Recover' });
    expect(recoverButtons).toHaveLength(1);
  });

  it('swaps the entry to a recovered indicator on success without affecting other entries', async () => {
    const store = {
      jobs: signal(new Map([['job-1', job([
        { path: 'wiki/gone.md', action: 'delete' },
        { path: 'wiki/also-gone.md', action: 'delete' },
      ])]])),
    };
    const api = { recoverDeletedFile: vi.fn().mockReturnValue(of(undefined)) };

    await renderViewer(store, api as unknown as Partial<ApiService>);

    // Two delete entries -> two recover buttons initially.
    expect(screen.getAllByRole('button', { name: 'Recover' })).toHaveLength(2);

    await fireEvent.click(screen.getAllByRole('button', { name: 'Recover' })[0]);

    expect(api.recoverDeletedFile).toHaveBeenCalledWith('job-1', 'wiki/gone.md');
    // The recovered entry shows the indicator; the other delete entry keeps its button.
    expect(screen.getByText('Recovered')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Recover' })).toHaveLength(1);
  });

  it('keeps the action available when recovery fails', async () => {
    const store = {
      jobs: signal(new Map([['job-1', job([{ path: 'wiki/gone.md', action: 'delete' }])]])),
    };
    const api = { recoverDeletedFile: vi.fn().mockReturnValue(throwError(() => new Error('conflict'))) };
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await renderViewer(store, api as unknown as Partial<ApiService>);
    await fireEvent.click(screen.getByRole('button', { name: 'Recover' }));

    expect(screen.getByRole('button', { name: 'Recover' })).toBeTruthy();
    expect(screen.queryByText('Recovered')).toBeNull();
  });
});
