import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  inject,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import type { Core } from 'cytoscape';
import { ApiService, GraphResponse } from '../services/api.service';
import { GraphSettings, DEFAULT_GRAPH_SETTINGS } from './graph-settings.component';

const COLLAPSED_CLASS = 'cy-collapsed';

@Component({
  selector: 'app-graph-view',
  standalone: true,
  imports: [TranslocoPipe],
  template: `
    <div class="graph-view-wrapper">
      @if (error) {
        <div class="graph-overlay graph-error">
          <span>{{ 'graph.error' | transloco }}</span>
        </div>
      }
      <div #graphContainer class="graph-container"></div>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 100%;
      }
      .graph-view-wrapper {
        position: relative;
        height: 100%;
        width: 100%;
      }
      .graph-container {
        height: 100%;
        width: 100%;
        background: var(--surface-ground, #1a1a2e);
      }
      .graph-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1rem;
        background: rgba(0, 0, 0, 0.45);
        z-index: 10;
        color: var(--text-color, #eee);
      }
      .graph-overlay p-progressBar {
        width: 200px;
      }
      .graph-error {
        color: var(--red-400, #f87171);
      }
    `,
  ],
})
export class GraphViewComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('graphContainer') containerRef!: ElementRef<HTMLDivElement>;
  @Input() settings: GraphSettings = { ...DEFAULT_GRAPH_SETTINGS };
  @Input() activePath: string | null = null;

  error = false;

  private cy: Core | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private cytoscapeFn: any = null;
  private graphData: GraphResponse | null = null;
  private collapsedNodes = new Set<string>();

  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);

  async ngAfterViewInit(): Promise<void> {
    // @ts-ignore — cytoscape-fcose has no bundled type declarations
    const [{ default: cytoscape }, { default: fcose }] = await Promise.all([
      import('cytoscape'),
      import('cytoscape-fcose' as any),
    ]);
    cytoscape.use(fcose);
    this.cytoscapeFn = cytoscape;

    this.api.getGraph().subscribe({
      next: (data) => {
        this.graphData = data;
        this.initCytoscape(data);
      },
      error: () => {
        this.error = true;
        this.cdr.detectChanges();
      },
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.cy) return;

    if (changes['settings']) {
      this.applySettings(this.settings);
    }
    if (changes['activePath']) {
      this.highlightActivePath(this.activePath);
    }
  }

  ngOnDestroy(): void {
    this.cy?.destroy();
    this.cy = null;
  }

  private initCytoscape(data: GraphResponse): void {
    const { nodeSize, lineThickness, centerForce, repelForce, linkForce, linkDistance } = this.settings;

    this.cy = this.cytoscapeFn({
      container: this.containerRef.nativeElement,
      elements: [
        ...data.nodes.map((n) => ({ data: { id: n.id, label: n.label } })),
        ...data.edges.map((e, i) => ({
          data: { id: `e${i}`, source: e.source, target: e.target },
        })),
      ],
       
      style: [
        {
          selector: 'node',
          style: {
            width: nodeSize as any,
            height: nodeSize as any,
            label: '' as any,
            'font-size': 11 as any,
            color: '#e2e8f0',
            'background-color': '#6366f1',
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 4 as any,
            'text-wrap': 'ellipsis',
            'text-max-width': 120 as any,
          },
        },
        {
          selector: 'node.dimmed',
          style: {
            opacity: 0.08 as any,
          },
        },
        {
          selector: 'node.hovered',
          style: {
            opacity: 1 as any,
            label: 'data(label)' as any,
            'background-color': '#f59e0b',
            'font-size': 12 as any,
            'font-weight': 'bold' as any,
            'text-background-color': '#1e1e2e' as any,
            'text-background-opacity': 0.85 as any,
            'text-background-padding': '3px' as any,
          },
        },
        {
          selector: 'node.neighbor',
          style: {
            opacity: 1 as any,
            label: 'data(label)' as any,
            'text-background-color': '#1e1e2e' as any,
            'text-background-opacity': 0.7 as any,
            'text-background-padding': '2px' as any,
          },
        },
        {
          selector: 'node.active-node',
          style: {
            'background-color': '#f59e0b',
            'border-width': 3,
            'border-color': '#fbbf24',
          },
        },
        {
          selector: 'edge',
          style: {
            width: lineThickness,
            'line-color': '#4b5563',
            'curve-style': 'straight' as any,
            opacity: 0.7,
          },
        },
        {
          selector: 'edge.dimmed',
          style: {
            opacity: 0.04 as any,
          },
        },
        {
          selector: 'edge.highlighted',
          style: {
            opacity: 1 as any,
            'line-color': '#818cf8',
          },
        },
      ],
      layout: this.buildLayout(centerForce, repelForce, linkForce, linkDistance, false) as any,
    });

    this.cy!.on('mouseover', 'node', (evt) => {
      const node = evt.target;
      const hood = node.closedNeighborhood();
      this.cy!.elements().not(hood).addClass('dimmed');
      node.addClass('hovered');
      hood.nodes().not(node).addClass('neighbor');
      hood.edges().addClass('highlighted');
    });

    this.cy!.on('mouseout', 'node', () => {
      this.cy!.elements().removeClass('dimmed hovered neighbor highlighted');
    });

    this.cy!.on('tap', 'node', (evt) => {
      const nodeId = evt.target.id();
      this.router.navigate(['explorer', ...nodeId.split('/')]);
    });

    this.cy!.on('dbltap', 'node', (evt) => {
      const node = evt.target;
      const nodeId = node.id() as string;
      if (this.collapsedNodes.has(nodeId)) {
        this.expandNode(nodeId);
      } else {
        this.collapseNode(nodeId);
      }
    });

    this.applyFilter(this.settings.filterText, this.settings.showOrphans);
    this.highlightActivePath(this.activePath);
  }

  private collapseNode(nodeId: string): void {
    if (!this.cy) return;
    const node = this.cy.getElementById(nodeId);
    const neighbours = node.neighborhood('node');
    const exclusiveNeighbours = neighbours.filter((n) => {
      return n.neighborhood('node').length === 1;
    });
    (exclusiveNeighbours as any).hide();
    this.collapsedNodes.add(nodeId);
  }

  private expandNode(nodeId: string): void {
    if (!this.cy) return;
    const node = this.cy.getElementById(nodeId);
    (node.neighborhood('node') as any).show();
    this.collapsedNodes.delete(nodeId);
  }

  private applySettings(s: GraphSettings): void {
    this.applyNodeSize(s.nodeSize);
    this.applyLineThickness(s.lineThickness);
    this.applyFilter(s.filterText, s.showOrphans);
    this.applyPhysics(s.centerForce, s.repelForce, s.linkForce, s.linkDistance);
  }

  applyNodeSize(value: number): void {
    if (!this.cy) return;
    this.cy
      .style()
      .selector('node')
      .style({ width: value as any, height: value as any })
      .update();
  }

  applyLineThickness(value: number): void {
    if (!this.cy) return;
    this.cy
      .style()
      .selector('edge')
      .style({ width: value as any })
      .update();
  }

  applyFilter(text: string, showOrphans: boolean): void {
    if (!this.cy) return;
    const lower = text.toLowerCase();
    this.cy.nodes().forEach((node) => {
      const label: string = node.data('label') as string;
      const matchesFilter = !lower || label.toLowerCase().includes(lower);
      const degree = node.degree(false);
      const isOrphan = degree === 0;
      if (!matchesFilter || (isOrphan && !showOrphans)) {
        (node as any).hide();
      } else {
        (node as any).show();
      }
    });
    this.cy.edges().forEach((edge) => {
      const sourceVisible = (edge.source() as any).visible();
      const targetVisible = (edge.target() as any).visible();
      if (sourceVisible && targetVisible) {
        (edge as any).show();
      } else {
        (edge as any).hide();
      }
    });
  }

  applyPhysics(centerForce: number, repelForce: number, linkForce: number, linkDistance: number): void {
    if (!this.cy) return;
    this.cy.layout(this.buildLayout(centerForce, repelForce, linkForce, linkDistance, true) as any).run();
  }

  private highlightActivePath(path: string | null): void {
    if (!this.cy) return;
    this.cy.nodes().removeClass('active-node');
    if (path) {
      this.cy.getElementById(path).addClass('active-node');
    }
  }

  private buildLayout(
    gravity: number,
    nodeRepulsion: number,
    edgeElasticity: number,
    idealEdgeLength: number,
    animate = false,
  ): object {
    return {
      name: 'fcose',
      quality: 'default',
      animate,
      animationDuration: 500,
      fit: true,
      padding: 40,
      randomize: true,
      gravity,
      nodeRepulsion: () => nodeRepulsion,
      edgeElasticity: () => edgeElasticity,
      idealEdgeLength: () => idealEdgeLength,
      nodeSeparation: 80,
      numIter: 3000,
      tile: true,
      tilingPaddingVertical: 10,
      tilingPaddingHorizontal: 10,
    };
  }
}
