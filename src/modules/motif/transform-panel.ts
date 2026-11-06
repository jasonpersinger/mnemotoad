import { element, button } from '../../ui/dom';
import { quantizeNotes, transposeNotes, velocityNotes, type Grid } from './commands';
import type { MotifSession } from './session';
export function transformPanel(root: HTMLElement, session: MotifSession, act: (action: () => void) => boolean): void {
  const details = element(root,'details',undefined,'mnemobard-transforms');element(details,'summary','Transform notes');
  const controls = element(details,'div',undefined,'mnemobard-transform-controls');
  const field = (label: string, value: number, min: number, max: number): HTMLInputElement => {const wrap=element(controls,'label');element(wrap,'span',label);const input=element(wrap,'input');input.type='number';input.min=String(min);input.max=String(max);input.step='1';input.value=String(value);input.setAttribute('aria-label',label);return input;};
  const semitones=field('Transpose semitones',0,-127,127);
  const selected = (operation: (ids: ReadonlySet<string>) => void): void => { if(!session.selected.size)throw Error('Select at least one note for this operation.');operation(session.selected); };
  button(controls,'Transpose selected',()=>act(()=>selected(ids=>session.edit('Transpose notes',m=>transposeNotes(m,ids,Number(semitones.value))))));
  button(controls,'Octave down',()=>act(()=>selected(ids=>session.edit('Octave down',m=>transposeNotes(m,ids,-12)))));button(controls,'Octave up',()=>act(()=>selected(ids=>session.edit('Octave up',m=>transposeNotes(m,ids,12)))));
  const gridWrap=element(controls,'label');element(gridWrap,'span','Quantization grid');const grid=element(gridWrap,'select');grid.setAttribute('aria-label','Quantization grid');
  for(const[value,text]of[['quarter','1/4'],['eighth','1/8'],['sixteenth','1/16'],['triplet','1/8 triplet']]){const option=element(grid,'option',text);option.value=value??'';}grid.value='sixteenth';
  const scopeWrap=element(controls,'label');element(scopeWrap,'span','Quantization scope');const scope=element(scopeWrap,'select');scope.setAttribute('aria-label','Quantization scope');for(const[value,text]of[['selected','Selected notes'],['all','Whole motif']]){const option=element(scope,'option',text);option.value=value??'';}
  button(controls,'Quantize starts',()=>act(()=>{const ids=scope.value==='all'?new Set(session.draft.data.notes.map(n=>n.id)):session.selected;if(!ids.size)throw Error('Choose notes before quantizing.');session.edit('Quantize starts',m=>quantizeNotes(m,ids,grid.value as Exclude<Grid,'off'>));}));
  const velocity=field('Set selected velocity',96,1,127);button(controls,'Set velocity',()=>act(()=>selected(ids=>session.edit('Set velocity',m=>velocityNotes(m,ids,Number(velocity.value))))));
  element(details,'p','Each command is one undo step. Starts only are quantized; identities/durations remain. Any bounds or same-pitch collision rejects the entire operation.','mnemobard-hint');
}
