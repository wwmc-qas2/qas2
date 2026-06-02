// Extracted permissions helpers

function roleRank(role){return {user:1,supervisor:2,admin:3}[role]||0;}

function isAdmin(){return roleRank(currentUser?.role)>=3;}

function isSupervisor(){return roleRank(currentUser?.role)>=2;}

function ensureLoggedIn(){if(!currentUser){showToast('Session expired. Please sign in again.','error');throw new Error('Not logged in');}}

function requireRole(minRole,message='You do not have permission for this action.'){ensureLoggedIn();if(roleRank(currentUser.role)<roleRank(minRole)){showToast(message,'error');throw new Error(message);}return true;}

function canManageTickets(){return isSupervisor();}

function canEditReport(report){if(!currentUser||!report)return false; if(isAdmin()) return true; return currentUser.role==='supervisor' && report.submitted_by_username===currentUser.username;}

function canDeleteReport(report){return !!currentUser && isAdmin() && !!report;}
