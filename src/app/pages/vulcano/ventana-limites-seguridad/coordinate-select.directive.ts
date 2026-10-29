import { Directive, ElementRef, inject } from '@angular/core';

/** Selecciona al entrar y deja libres los clics posteriores dentro del campo. */
@Directive({
  selector: 'input[appCoordinateSelect]',
  standalone: true,
  host: {
    '(pointerdown)': 'onPointerDown($event)',
    '(focus)': 'selectContent()',
    '(mouseup)': 'onMouseUp($event)',
    '(blur)': 'enteringWithPointer = false',
    '(pointercancel)': 'enteringWithPointer = false',
  },
})
export class CoordinateSelectDirective {
  private readonly input = inject(ElementRef<HTMLInputElement>).nativeElement;
  protected enteringWithPointer = false;

  protected onPointerDown(event: PointerEvent): void {
    this.enteringWithPointer = event.button === 0 &&
      this.input.ownerDocument.activeElement !== this.input;
  }

  protected selectContent(): void {
    this.input.select();
  }

  protected onMouseUp(event: MouseEvent): void {
    if (!this.enteringWithPointer) return;
    this.enteringWithPointer = false;
    // El mouseup inicial puede deshacer la seleccion realizada durante focus.
    event.preventDefault();
    this.input.select();
  }
}
