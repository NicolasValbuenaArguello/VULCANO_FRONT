import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators, ValidatorFn } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { PointsService } from './points.service';
import { PointInput, PointRecord } from './point.model';

const finite: ValidatorFn = control => typeof control.value === 'number' && Number.isFinite(control.value) ? null : { finite: true };

@Component({
  selector: 'demo-points', standalone: true, imports: [ReactiveFormsModule, DatePipe],
  templateUrl: './points.component.html', styleUrl: './points.component.css',
})
export class PointsComponent implements OnInit {
  private readonly api = inject(PointsService);
  private readonly destroyRef = inject(DestroyRef);
  readonly points = signal<PointRecord[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly editingId = signal<string | null>(null);
  readonly deleting = signal<PointRecord | null>(null);
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/\S/), Validators.maxLength(100)] }),
    x: new FormControl<number | null>(null, [Validators.required, finite]),
    y: new FormControl<number | null>(null, [Validators.required, finite]),
    description: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(1000)] }),
  });

  ngOnInit(): void { this.load(); }

  load(): void {
    if (this.busy()) return;
    this.begin();
    this.api.list().pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.busy.set(false))).subscribe({
      next: points => this.points.set(points), error: error => this.error.set(error.message),
    });
  }

  save(): void {
    if (this.busy()) return;
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const raw = this.form.getRawValue();
    const value: PointInput = { name: raw.name.trim(), x: raw.x!, y: raw.y!, description: raw.description.trim() };
    const id = this.editingId();
    this.begin();
    const request = id ? this.api.update(id, value) : this.api.create(value);
    request.pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.busy.set(false))).subscribe({
      next: record => {
        this.points.update(points => points.some(point => point.id === record.id)
          ? points.map(point => point.id === record.id ? record : point) : [...points, record]);
        this.cancelEdit();
        this.success.set(id ? 'Punto actualizado.' : 'Punto creado.');
      },
      error: error => this.error.set(error.message),
    });
  }

  edit(point: PointRecord): void {
    if (this.busy()) return;
    this.editingId.set(point.id);
    this.deleting.set(null);
    this.form.reset({ name: point.name, x: point.x, y: point.y, description: point.description });
    this.error.set(''); this.success.set('');
  }

  cancelEdit(): void {
    this.editingId.set(null);
    this.form.reset({ name: '', x: null, y: null, description: '' });
  }

  confirmDelete(): void {
    const point = this.deleting();
    if (!point || this.busy()) return;
    this.begin();
    this.api.delete(point.id).pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.busy.set(false))).subscribe({
      next: () => {
        this.points.update(points => points.filter(item => item.id !== point.id));
        if (this.editingId() === point.id) this.cancelEdit();
        this.deleting.set(null);
        this.success.set('Punto eliminado.');
      },
      error: error => this.error.set(error.message),
    });
  }

  private begin(): void { this.busy.set(true); this.error.set(''); this.success.set(''); }
}
