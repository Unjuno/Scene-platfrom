import SceneApp from './components/SceneApp';
import {getChatGPTUser} from './chatgpt-auth';
export const dynamic='force-dynamic';
export default async function Home(){const user=await getChatGPTUser();return <SceneApp initialUser={user?{id:user.userId,name:user.fullName||'旅の創作者'}:null}/>}
