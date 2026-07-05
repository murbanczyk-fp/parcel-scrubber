import { Pipe, PipeTransform } from '@angular/core';

export function parseOrderDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

@Pipe({
  name: 'orderDateLocal',
  standalone: true,
})
export class OrderDateLocalPipe implements PipeTransform {
  transform(value: string | null | undefined): Date | null {
    if (!value) {
      return null;
    }

    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) {
      return null;
    }

    return new Date(year, month - 1, day);
  }
}
