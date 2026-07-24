import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { Checkbox } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { Slider } from 'primeng/slider';

export interface GraphSettings {
  filterText: string;
  showOrphans: boolean;
  nodeSize: number;
  lineThickness: number;
  centerForce: number;
  repelForce: number;
  linkForce: number;
  linkDistance: number;
}

export const DEFAULT_GRAPH_SETTINGS: GraphSettings = {
  filterText: '',
  showOrphans: false,
  nodeSize: 20,
  lineThickness: 1,
  centerForce: 0.25,
  repelForce: 8000,
  linkForce: 0.3,
  linkDistance: 80,
};

@Component({
  selector: 'app-graph-settings',
  standalone: true,
  imports: [FormsModule, TranslocoPipe, Checkbox, InputTextModule, Slider, DecimalPipe],
  template: `
    <div class="graph-settings-panel">
      <div class="gs-row">
        <input
          pInputText
          type="text"
          class="gs-filter"
          [placeholder]="'graph.filterPlaceholder' | transloco"
          [(ngModel)]="settings.filterText"
          (ngModelChange)="emit()"
        />
      </div>

      <div class="gs-row gs-checkbox-row">
        <p-checkbox [(ngModel)]="settings.showOrphans" [binary]="true" inputId="showOrphans" (ngModelChange)="emit()" />
        <label for="showOrphans">{{ 'graph.showOrphans' | transloco }}</label>
      </div>

      <div class="gs-slider-row">
        <label
          >{{ 'graph.nodeSize' | transloco }} <span class="gs-val">{{ settings.nodeSize }}</span></label
        >
        <p-slider [(ngModel)]="settings.nodeSize" [min]="10" [max]="80" (ngModelChange)="emit()" />
      </div>

      <div class="gs-slider-row">
        <label
          >{{ 'graph.lineThickness' | transloco }} <span class="gs-val">{{ settings.lineThickness }}</span></label
        >
        <p-slider [(ngModel)]="settings.lineThickness" [min]="1" [max]="10" (ngModelChange)="emit()" />
      </div>

      <div class="gs-slider-row">
        <label
          >{{ 'graph.centerForce' | transloco }}
          <span class="gs-val">{{ settings.centerForce | number: '1.2-2' }}</span></label
        >
        <p-slider [(ngModel)]="settings.centerForce" [min]="0" [max]="1" [step]="0.01" (ngModelChange)="emit()" />
      </div>

      <div class="gs-slider-row">
        <label
          >{{ 'graph.repelForce' | transloco }} <span class="gs-val">{{ settings.repelForce }}</span></label
        >
        <p-slider [(ngModel)]="settings.repelForce" [min]="500" [max]="15000" [step]="100" (ngModelChange)="emit()" />
      </div>

      <div class="gs-slider-row">
        <label
          >{{ 'graph.linkForce' | transloco }}
          <span class="gs-val">{{ settings.linkForce | number: '1.2-2' }}</span></label
        >
        <p-slider [(ngModel)]="settings.linkForce" [min]="0" [max]="1" [step]="0.01" (ngModelChange)="emit()" />
      </div>

      <div class="gs-slider-row">
        <label
          >{{ 'graph.linkDistance' | transloco }} <span class="gs-val">{{ settings.linkDistance }}</span></label
        >
        <p-slider [(ngModel)]="settings.linkDistance" [min]="30" [max]="500" [step]="10" (ngModelChange)="emit()" />
      </div>
    </div>
  `,
  styles: [
    `
      .graph-settings-panel {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding: 0.75rem;
        overflow-y: auto;
        height: 100%;
      }
      .gs-row {
        display: flex;
        align-items: center;
      }
      .gs-filter {
        width: 100%;
      }
      .gs-checkbox-row {
        gap: 0.5rem;
      }
      .gs-slider-row {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
      }
      .gs-slider-row label {
        font-size: 0.8rem;
        color: var(--text-color-secondary, #888);
        display: flex;
        justify-content: space-between;
      }
      .gs-val {
        font-variant-numeric: tabular-nums;
      }
      :host ::ng-deep .p-slider {
        width: 100%;
      }
    `,
  ],
})
export class GraphSettingsComponent implements OnChanges {
  @Input() settings: GraphSettings = { ...DEFAULT_GRAPH_SETTINGS };
  @Output() settingsChange = new EventEmitter<GraphSettings>();

  ngOnChanges(): void {
    // no-op — settings are passed in from parent
  }

  emit(): void {
    this.settingsChange.emit({ ...this.settings });
  }
}
