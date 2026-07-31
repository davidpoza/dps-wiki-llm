import { describe, it, expect } from 'vitest';
import { Component, input } from '@angular/core';
import { render, screen } from '@testing-library/angular';

@Component({
  selector: 'app-greeting',
  template: `<p>Hello {{ name() }}</p>`,
})
class GreetingComponent {
  readonly name = input('world');
}

// Smoke test proving the Vitest builder wires up Angular's TestBed environment
// and @testing-library/angular can render standalone components.
describe('testing harness (Vitest + @testing-library/angular + TestBed)', () => {
  it('renders a standalone component through TestBed', async () => {
    await render(GreetingComponent);
    expect(screen.getByText('Hello world')).toBeTruthy();
  });

  it('binds signal inputs', async () => {
    await render(GreetingComponent, { inputs: { name: 'DPS' } });
    expect(screen.getByText('Hello DPS')).toBeTruthy();
  });
});
