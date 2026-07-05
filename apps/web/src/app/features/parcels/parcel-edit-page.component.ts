import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { ParcelFormComponent } from './parcel-form.component';

@Component({
  selector: 'app-parcel-edit-page',
  imports: [ParcelFormComponent],
  template: `
    <app-parcel-form
      mode="edit"
      [parcelId]="parcelId()"
      [returnPath]="returnPath()"
    />
  `,
})
export class ParcelEditPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);

  protected readonly parcelId = signal('');
  protected readonly returnPath = signal<'/active' | '/archive'>('/active');

  ngOnInit(): void {
    this.parcelId.set(this.route.snapshot.paramMap.get('id') ?? '');
    const configuredPath = this.route.snapshot.data['returnPath'] as
      | '/active'
      | '/archive'
      | undefined;
    this.returnPath.set(configuredPath ?? '/active');
  }
}
