import { Component } from '@angular/core';

import { ParcelFormComponent } from './parcel-form.component';

@Component({
  selector: 'app-parcel-create-page',
  imports: [ParcelFormComponent],
  template: `<app-parcel-form mode="create" returnPath="/active" />`,
})
export class ParcelCreatePageComponent {}
