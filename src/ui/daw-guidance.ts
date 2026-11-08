import { element } from './dom';

/**
 * 4H: DAW import guidance for MIDI exports. The labels are quoted from REAPER 7.84 on Linux as captured in the Milestone 4G
 * isolated check (output/mnemobard/milestone-4g/reaper/); the text says so instead of claiming every version behaves alike.
 * Collapsed by default; nothing here changes what is exported.
 */
export function reaperGuidance(root: HTMLElement, options: { multitrack: boolean; laneTracks?: number; check?: string }): HTMLDetailsElement {
  const details = element(root, 'details', undefined, 'mnemobard-daw-guidance'); element(details, 'summary', 'Importing into REAPER');
  const steps = element(details, 'ol');
  element(steps, 'li', 'Insert the exported file into a REAPER project as media. REAPER asks how to import it in a “MIDI File Import” dialog.');
  if (options.multitrack) element(steps, 'li', `Tick “Expand ${options.laneTracks ?? 'N'} MIDI tracks to new REAPER tracks”. Without it, every lane is merged into one item on a single track.`);
  element(steps, 'li', 'Tick “Import MIDI tempo map to project tempo map”. Without it, REAPER keeps its own project tempo and meter, so the notes no longer line up with its bars and beats.');
  element(steps, 'li', options.check ? `Check the imported project against this export: ${options.check}.` : 'Check that REAPER’s tempo and meter match the motif’s.');
  element(details, 'p', 'Verified with REAPER 7.84 on Linux, where both options were unticked by default. Other versions, platforms or preferences may label, default or follow up these options differently.', 'mnemobard-hint');
  return details;
}
/** Why a DAW can show the imported item ending before the composition does. Shown only when the last note ends early. */
export function endingExplanation(root: HTMLElement, composition: string, lastNote: string): HTMLElement {
  return element(root, 'p', `The file ends exactly at the composition end (${composition}); every track ends there. REAPER, like some other DAWs, sizes an imported MIDI item to its last note (${lastNote}), so the item can look shorter. The difference is the arrangement’s closing silence. No notes are missing and nothing is added to the file to stretch the item.`, 'mnemobard-hint');
}
