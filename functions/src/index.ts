import { initializeApp } from 'firebase-admin/app'

initializeApp()

export { submitBallot } from './election/submitBallot'
export { countVotes } from './election/countVotes'
export { advanceStage, generateOnsiteKey } from './election/advanceStage'
export { getVoterStatus } from './election/getVoterStatus'
