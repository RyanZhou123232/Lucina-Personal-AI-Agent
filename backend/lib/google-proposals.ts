import type {AgentTurn} from '@/lib/deepseek';
import {emailPayload,calendarPayload} from '@/lib/google-api';
// Pure validation only. Preparing a provider draft happens after the proposal
// and its original evidence have passed examination and been saved for Review.
export function bindGoogleProposals(turn:AgentTurn):AgentTurn{
 const proposals:AgentTurn['proposals']=[],warnings:string[]=[];
 for(const proposal of turn.proposals){
  try{
   const payload=proposal.changeType==='draft_email'?emailPayload(proposal.payload):proposal.changeType==='create_calendar_event'?calendarPayload(proposal.payload):null;
   proposals.push(payload?{...proposal,payload:{...payload}}:proposal);
  }catch(error){warnings.push(error instanceof Error?error.message:'Incomplete Google proposal.');}
 }
 return {...turn,proposals,...(warnings.length?{warning:[turn.warning,...warnings].filter(Boolean).join(' ')}:{})};
}
