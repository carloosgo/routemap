import { useReducer, useCallback } from 'react';
import { createTrip, appendSegment, normalizeTrip, createChecklistItem, createPlace, reorderSegments, TRIP_LIMITS } from './tripModel.js';
import { invalidateStaleSegmentRoute } from '../routes/routeModel.js';
import { sanitizeText, uid } from '../../shared/utils.js';

function reducer(state,action){switch(action.type){
case'RESET':return appendSegment(createTrip());
case'LOAD':return normalizeTrip(action.trip);
case'RENAME':return{...state,name:sanitizeText(action.name),updatedAt:nowISO()};
case'SET_CURRENCY':return{...state,currency:action.currency,updatedAt:nowISO()};
case'ADD_NOTE':return{...state,notes:[...(state.notes||[]),{id:uid(),title:'Nueva nota',text:''}],updatedAt:nowISO()};
case'UPDATE_NOTE':return{...state,notes:(state.notes||[]).map(n=>n.id===action.id?{...n,[action.field]:action.value}:n),updatedAt:nowISO()};
case'REMOVE_NOTE':return{...state,notes:(state.notes||[]).filter(n=>n.id!==action.id),updatedAt:nowISO()};
case'ADD_CHECKLIST_ITEM':return{...state,checklist:[...(state.checklist||[]),createChecklistItem(action.text)],updatedAt:nowISO()};
case'TOGGLE_CHECKLIST_ITEM':return{...state,checklist:(state.checklist||[]).map(item=>item.id===action.id?{...item,done:!item.done}:item),updatedAt:nowISO()};
case'REMOVE_CHECKLIST_ITEM':return{...state,checklist:(state.checklist||[]).filter(item=>item.id!==action.id),updatedAt:nowISO()};
case'ADD_SEGMENT':return appendSegment(state);
case'REMOVE_SEGMENT':return{...state,segments:state.segments.filter(s=>s.id!==action.segmentId),updatedAt:nowISO()};
case'REORDER_SEGMENT':return reorderSegments(state,action.sourceId,action.targetId,action.placement);
case'UPDATE_SEGMENT':return{...state,segments:state.segments.map(s=>s.id===action.segmentId?invalidateStaleSegmentRoute({...s,...action.patch}):s),updatedAt:nowISO()};
case'UPDATE_EXPENSES':return{...state,segments:state.segments.map(s=>s.id===action.segmentId?invalidateStaleSegmentRoute({...s,expenses:action.expenses}):s),updatedAt:nowISO()};
case'ADD_PLACE':{const current=state.places||[];if(current.length>=TRIP_LIMITS.places||current.some(place=>place.id===action.place?.id))return state;return{...state,places:[...current,createPlace(action.place)],updatedAt:nowISO()};}
case'REMOVE_PLACE':return{...state,places:(state.places||[]).filter(place=>place.id!==action.placeId),updatedAt:nowISO()};
default:return state;}}

export function useTrip(initial){const[trip,dispatch]=useReducer(reducer,initial,init=>init?normalizeTrip(init):appendSegment(createTrip()));const resetTrip=useCallback(()=>dispatch({type:'RESET'}),[]);const loadTrip=useCallback(t=>dispatch({type:'LOAD',trip:t}),[]);const renameTrip=useCallback(name=>dispatch({type:'RENAME',name}),[]);const setCurrency=useCallback(currency=>dispatch({type:'SET_CURRENCY',currency}),[]);const addNote=useCallback(()=>dispatch({type:'ADD_NOTE'}),[]);const updateNote=useCallback((id,field,value)=>dispatch({type:'UPDATE_NOTE',id,field,value}),[]);const removeNote=useCallback(id=>dispatch({type:'REMOVE_NOTE',id}),[]);const addChecklistItem=useCallback(text=>dispatch({type:'ADD_CHECKLIST_ITEM',text}),[]);const toggleChecklistItem=useCallback(id=>dispatch({type:'TOGGLE_CHECKLIST_ITEM',id}),[]);const removeChecklistItem=useCallback(id=>dispatch({type:'REMOVE_CHECKLIST_ITEM',id}),[]);const addSegment=useCallback(()=>dispatch({type:'ADD_SEGMENT'}),[]);const removeSegment=useCallback(segmentId=>dispatch({type:'REMOVE_SEGMENT',segmentId}),[]);const reorderSegment=useCallback((sourceId,targetId,placement)=>dispatch({type:'REORDER_SEGMENT',sourceId,targetId,placement}),[]);const updateSegment=useCallback((segmentId,patch)=>dispatch({type:'UPDATE_SEGMENT',segmentId,patch}),[]);const updateExpenses=useCallback((segmentId,expenses)=>dispatch({type:'UPDATE_EXPENSES',segmentId,expenses}),[]);const addPlace=useCallback(place=>dispatch({type:'ADD_PLACE',place}),[]);const removePlace=useCallback(placeId=>dispatch({type:'REMOVE_PLACE',placeId}),[]);return{trip,resetTrip,loadTrip,renameTrip,setCurrency,addNote,updateNote,removeNote,addChecklistItem,toggleChecklistItem,removeChecklistItem,addSegment,removeSegment,reorderSegment,updateSegment,updateExpenses,addPlace,removePlace};}
function nowISO(){return new Date().toISOString();}
