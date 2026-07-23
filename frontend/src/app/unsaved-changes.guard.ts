import { CanDeactivateFn } from '@angular/router';

export interface UnsavedChangesAware {
  canDeactivate: () => boolean;
}

export const unsavedChangesGuard: CanDeactivateFn<UnsavedChangesAware> = (component) => component.canDeactivate();
