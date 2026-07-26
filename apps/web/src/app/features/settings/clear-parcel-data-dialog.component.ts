import { Component, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';

const CONFIRMATION_PHRASE = 'DELETE';

@Component({
  selector: 'app-clear-parcel-data-dialog',
  imports: [FormsModule, DialogModule, InputTextModule, ButtonModule],
  templateUrl: './clear-parcel-data-dialog.component.html',
  styleUrl: './clear-parcel-data-dialog.component.scss',
})
export class ClearParcelDataDialogComponent {
  readonly visible = input(false);
  readonly submitting = input(false);

  readonly visibleChange = output<boolean>();
  readonly confirmed = output<void>();

  protected readonly confirmationPhrase = signal('');

  constructor() {
    effect(() => {
      if (this.visible()) {
        this.confirmationPhrase.set('');
      }
    });
  }

  protected canConfirm(): boolean {
    return (
      this.confirmationPhrase() === CONFIRMATION_PHRASE && !this.submitting()
    );
  }

  protected onVisibleChange(next: boolean): void {
    if (!this.submitting()) {
      this.visibleChange.emit(next);
    }
  }

  protected onCancel(): void {
    if (!this.submitting()) {
      this.visibleChange.emit(false);
    }
  }

  protected onConfirm(): void {
    if (this.canConfirm()) {
      this.confirmed.emit();
    }
  }
}
