// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { WorkspaceLeaf } from 'obsidian';
import { CanvasLibrary } from '../src/modules/canvas/library';
import type { FoundationServices } from '../src/application/services';
import { NavigationCoordinator } from '../src/application/navigation';
import { SettingsService } from '../src/application/settings';
import { ModuleController } from '../src/application/modules';
import { EntityIndex } from '../src/storage/index';
import { EntityRepository } from '../src/storage/repository';
import { ReferenceResolver } from '../src/storage/references';
import { PatchbookLibrary } from '../src/modules/patchbook/library';
import { PatchbookAssets } from '../src/modules/patchbook/assets';
import { AudioPreview } from '../src/modules/patchbook/preview';
import { PatchbookRecovery } from '../src/modules/patchbook/recovery';
import { MotifLibrary } from '../src/modules/motif/library';
import { PatchbookView } from '../src/modules/patchbook/view';
import { MotifView } from '../src/modules/motif/view';
import { MusicalTransport } from '../src/music/transport';
import { createEntity } from '../src/domain/entities';
import { MemoryVault } from './support/memory-vault';
import { installDomHelpers, Scope, Keymap } from './support/obsidian';
const closers: (() => void)[] = [];
beforeEach(() => { installDomHelpers(); Object.defineProperty(HTMLCanvasElement.prototype,'getContext',{configurable:true,value:()=>null}); });
afterEach(() => { for(const close of closers.splice(0))close();document.body.replaceChildren(); });
async function fixture() {
  const vault=new MemoryVault(),index=new EntityIndex(vault),repository=new EntityRepository(vault,index),settings=new SettingsService({load:async()=>null,save:async()=>{}});await settings.load();
  const services:FoundationServices={ navigation: new NavigationCoordinator(),settings,index,repository,modules:new ModuleController(settings.current.modules,{open:async()=>{},close:()=>{}}),references:new ReferenceResolver(index,path=>vault.exists(path)),patchbook:new PatchbookLibrary(index,repository),assets:new PatchbookAssets(vault),preview:new AudioPreview(),recovery:new PatchbookRecovery(vault,index,repository),canvas:new CanvasLibrary(index,repository,vault),motifs:new MotifLibrary(index,repository,vault),musical:new MusicalTransport()};
  const view=new MotifView({} as WorkspaceLeaf,()=>services);document.body.append(view.contentEl);closers.push(()=>{view.release();services.canvas.dispose();services.motifs.dispose();services.musical.dispose();services.patchbook.dispose();repository.dispose();index.dispose();settings.dispose();});await view.onOpen();return{view,services,vault,repository};
}
const settle=async()=>{await new Promise(r=>setTimeout(r,0));await new Promise(r=>setTimeout(r,0));};
function click(root:HTMLElement,text:string){const button=[...root.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent===text&&!b.disabled);if(!button)throw Error('Missing button '+text);button.click();}
function input(root:HTMLElement,label:string,value:string){const input=[...root.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('input,textarea')].find(node=>node.getAttribute('aria-label')===label);if(!input)throw Error('Missing input '+label);input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));return input;}
it('creates, names, numerically edits and saves a motif using real DOM handlers',async()=>{
 const{view,services}=await fixture();click(view.contentEl,'New motif');await settle();input(view.contentEl,'Motif name','Keyboard phrase');click(view.contentEl,'Add note');expect(view.contentEl.querySelectorAll('[data-note-id]')).toHaveLength(1);
 input(view.contentEl,'Pitch','65');input(view.contentEl,'Start tick','120');input(view.contentEl,'Duration ticks','360');input(view.contentEl,'Velocity','47');click(view.contentEl,'Apply to primary note');click(view.contentEl,'Save motif');await vi.waitFor(()=>expect(view.contentEl.querySelector('.mnemobard-save-status')?.textContent).toBe('Saved'));
 const item=services.motifs.items('Keyboard')[0];expect(item?.entity.data.notes[0]).toMatchObject({pitch:65,startTick:120,durationTicks:360,velocity:47});expect(view.contentEl.querySelector('.mnemobard-save-status')?.textContent).toBe('Saved');
});
it('uses a bounded textual list with stable multi-selection and independent duplication',async()=>{
 const{view,services}=await fixture();click(view.contentEl,'New motif');await settle();click(view.contentEl,'Add note');click(view.contentEl,'Duplicate selected');expect(services.motifs.drafts()[0]?.draft.data.notes).toHaveLength(2);
 const buttons=view.contentEl.querySelectorAll<HTMLButtonElement>('[data-note-id]');buttons[0]?.click();buttons[1]?.dispatchEvent(new MouseEvent('click',{bubbles:true,shiftKey:true}));expect(services.motifs.drafts()[0]?.selected.size).toBe(2);click(view.contentEl,'Delete selected');expect(services.motifs.drafts()[0]?.draft.data.notes).toHaveLength(0);click(view.contentEl,'Undo');expect(services.motifs.drafts()[0]?.draft.data.notes).toHaveLength(2);click(view.contentEl,'Redo');expect(services.motifs.drafts()[0]?.draft.data.notes).toHaveLength(0);
});
it('changes tempo/meter without retiming notes and rejects unsafe shortening',async()=>{
 const{view,services}=await fixture();click(view.contentEl,'New motif');await settle();click(view.contentEl,'Add note');const original=services.motifs.drafts()[0]?.draft.data.notes;
 input(view.contentEl,'Tempo BPM','100');input(view.contentEl,'Meter numerator','6');input(view.contentEl,'Meter denominator','8');click(view.contentEl,'Apply musical settings');expect(services.motifs.drafts()[0]?.draft.data).toMatchObject({tempoMicrosecondsPerQuarter:600000,meter:{numerator:6,denominator:8},notes:original});
 input(view.contentEl,'Length ticks','10');click(view.contentEl,'Apply musical settings');expect(view.contentEl.textContent).toContain('beyond motif');expect(services.motifs.drafts()[0]?.draft.data.lengthTicks).toBe(15360);click(view.contentEl,'Undo');expect(services.motifs.drafts()[0]?.draft.data.tempoMicrosecondsPerQuarter).toBe(500000);
});
it('preserves drafts and scoped history across view close/reopen and unregisters bindings',async()=>{
 const{view,services,vault}=await fixture();expect(view.scope).toBeInstanceOf(Scope);click(view.contentEl,'New motif');await settle();input(view.contentEl,'Motif name','Retained');click(view.contentEl,'Add note');const session=services.motifs.drafts()[0];if(!session)throw Error();const history=session.historySize;
 await view.onClose();expect(session.disposed).toBe(false);expect(session.recoveryPath&&vault.files.has(session.recoveryPath)).toBe(true);expect((view.scope as unknown as Scope).handlers.size).toBe(0);await view.onOpen();click(view.contentEl,'Retained');await settle();expect(session.historySize).toBe(history);expect(view.contentEl.querySelector('[data-note-id]')).not.toBeNull();
});
it('searches/opens stable UUIDs and reports invalid/future notes without rewriting them',async()=>{
 const{view,repository,vault}=await fixture();const record=await repository.create(createEntity('motif','Future phrase'));vault.modify(record.path,record.source.replace('mnemobard_schema: 1','mnemobard_schema: 99'));await settle();expect(view.contentEl.textContent).toContain('Unsupported entity schema');expect(vault.files.get(record.path)).toContain('mnemobard_schema: 99');
 input(view.contentEl,'Search motifs','none');expect(view.contentEl.textContent).toContain('No matching motifs');
});
it('loads recoverable musical drafts explicitly without granting PATCHBOOK musical editing',async()=>{
 const{view,services,repository,vault}=await fixture();const base=await repository.create(createEntity('motif','Recoverable phrase'));const path=await repository.saveEditorDraft({...base.entity,title:'Musical recovery'},base);expect((await services.recovery.inspect(path)).draft).toBeUndefined();
 click(view.contentEl,'Motif recovery');await settle();const entry=[...view.contentEl.querySelectorAll<HTMLButtonElement>('.mnemobard-recovery-row button')].find(button=>button.textContent?.startsWith('Musical recovery'));if(!entry)throw Error('No musical checkpoint');entry.click();await settle();click(view.contentEl,'Load draft without saving');await settle();expect(vault.files.get(base.path)).toBe(base.source);expect(view.contentEl.querySelector<HTMLInputElement>('[aria-label="Motif name"]')?.value).toBe('Musical recovery');
});

it('owns a child key scope only inside the editor and preserves native text undo',async()=>{
 const{view,services}=await fixture();click(view.contentEl,'New motif');await settle();click(view.contentEl,'Add note');
 const canvas=view.contentEl.querySelector('canvas');if(!canvas)throw Error();canvas.focus();await settle();const keymap=view.app.keymap as unknown as Keymap;expect(keymap.scopes.size).toBe(1);const scope=[...keymap.scopes][0];if(!scope)throw Error();const undo=[...scope.handlers].find(handler=>handler.key==='z'&&Array.isArray(handler.modifiers)&&handler.modifiers.length===1);if(!undo)throw Error('Missing editor undo');
 const input=view.contentEl.querySelector<HTMLInputElement>('[aria-label="Motif name"]');input?.focus();expect(undo.callback()).toBe(true);expect(services.motifs.drafts()[0]?.draft.data.notes).toHaveLength(1);canvas.focus();expect(undo.callback()).toBe(false);expect(services.motifs.drafts()[0]?.draft.data.notes).toHaveLength(0);
 view.contentEl.querySelector<HTMLInputElement>('[aria-label="Search motifs"]')?.focus();await settle();expect(keymap.scopes.size).toBe(0);canvas.focus();await settle();view.release();expect(keymap.scopes.size).toBe(0);expect(scope.handlers.size).toBe(0);
});

it('does not claim a Save while musical or note property fields remain unapplied',async()=>{
 const{view,services}=await fixture();click(view.contentEl,'New motif');await settle();input(view.contentEl,'Tempo BPM','80');click(view.contentEl,'Save motif');await settle();expect(services.motifs.items()).toHaveLength(0);expect(view.contentEl.textContent).toContain('Apply or discard pending');click(view.contentEl,'Discard settings changes');click(view.contentEl,'Add note');input(view.contentEl,'Velocity','60');click(view.contentEl,'Save motif');await settle();expect(services.motifs.items()).toHaveLength(0);click(view.contentEl,'Apply to primary note');click(view.contentEl,'Save motif');await vi.waitFor(()=>expect(view.contentEl.querySelector('.mnemobard-save-status')?.textContent).toBe('Saved'));expect(services.motifs.items()[0]?.entity.data.notes[0]?.velocity).toBe(60);
});

it('refreshes metadata controls after Undo and Redo without overwriting active typing',async()=>{
 const{view}=await fixture();click(view.contentEl,'New motif');await settle();
 for(const label of ['Description','Motif tags','User notes']){
  const control=input(view.contentEl,label,'first');control.focus();input(view.contentEl,label,'second');expect(control.value).toBe('second');
  view.contentEl.querySelector('canvas')?.focus();click(view.contentEl,'Undo');expect(control.value).toBe('');click(view.contentEl,'Redo');expect(control.value).toBe('second');
 }
});

it('exposes explicit transformations and exact musical-position editing in the existing history',async()=>{
 const{view,services}=await fixture();click(view.contentEl,'New motif');await settle();click(view.contentEl,'Add note');input(view.contentEl,'Position (bar:beat:tick)','2:1:17');click(view.contentEl,'Apply to primary note');const session=services.motifs.drafts()[0];expect(session?.draft.data.notes[0]?.startTick).toBe(3857);click(view.contentEl,'Undo');expect(session?.draft.data.notes[0]?.startTick).toBe(0);click(view.contentEl,'Redo');expect(session?.draft.data.notes[0]?.startTick).toBe(3857);
 input(view.contentEl,'Transpose semitones','7');const before=session?.historySize;click(view.contentEl,'Transpose selected');expect(session?.draft.data.notes[0]?.pitch).toBe(67);expect(session?.historySize).toBe(Number(before)+1);click(view.contentEl,'Undo');expect(session?.draft.data.notes[0]?.pitch).toBe(60);click(view.contentEl,'Quantize starts');expect(session?.draft.data.notes[0]?.startTick).toBe(3840);input(view.contentEl,'Set selected velocity','42');click(view.contentEl,'Set velocity');expect(session?.draft.data.notes[0]?.velocity).toBe(42);
});
it('associates an active PATCHBOOK UUID explicitly and preserves missing-reference diagnostics',async()=>{
 const{view,services,repository,vault}=await fixture();const patch=await repository.create(createEntity('patch','Patch context'));click(view.contentEl,'New motif');await settle();input(view.contentEl,'Find PATCHBOOK patch','Patch context');const choice=view.contentEl.querySelector<HTMLSelectElement>('[aria-label="Choose active patch"]');if(!choice)throw Error();choice.value=patch.entity.id;click(view.contentEl,'Associate chosen patch');const session=services.motifs.drafts()[0];expect(session?.draft.patchId).toBe(patch.entity.id);click(view.contentEl,'Save motif');await settle();expect(view.contentEl.textContent).toContain('Patch context');vault.files.delete(patch.path);await services.index.refresh(patch.path);expect(view.contentEl.textContent).toContain('Stored reference retained');click(view.contentEl,'Remove patch association');expect(services.motifs.drafts()[0]?.draft.patchId).toBeUndefined();click(view.contentEl,'Undo');expect(session?.draft.patchId).toBe(patch.entity.id);
});


it('loads a deferred PATCHBOOK leaf before explicit UUID navigation',async()=>{
 const{view,services,repository}=await fixture();const patch=await repository.create(createEntity('patch','Navigate context'));click(view.contentEl,'New motif');await settle();const session=services.motifs.drafts()[0];if(!session)throw Error();services.motifs.associate(session,patch.entity.id);const patchView=new PatchbookView({} as WorkspaceLeaf,()=>services);closers.push(()=>patchView.release());await patchView.onOpen();let loaded=0;const leaf={view:patchView,loadIfDeferred:async()=>{loaded++;}};Object.assign(view.app.workspace,{getLeavesOfType:()=>[leaf]});click(view.contentEl,'Open associated PATCHBOOK record');await settle();expect(loaded).toBe(1);expect(patchView.getState().selectedId).toBe(patch.entity.id);
});
