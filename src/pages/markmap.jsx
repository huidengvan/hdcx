import React, { useEffect, useState } from 'react'
import MarkmapHooks from '../components/MarkmapHooks'
import { postRequest, textRequest, useSyncCallback } from '../components/utils'
import '../css/markmap.css';

export default function map() {
  const [users, setUsers] = useState()
  const [currentuser, setCurrentuser] = useState()
  const [currentmark, setCurrentmark] = useState()
  const [marks, setMarks] = useState()
  const [text, setText] = useState()
  useEffect(() => {

    initData()
  }, [])
  const syncLoadMarklist = useSyncCallback(() => {
    loadMarklist(currentuser)
    if (currentmark)
    handleClick(currentmark)
  });
  const initData = async () => {
    const dirsUrl = 'https://box.hdcxb.net/api/fs/dirs?path=markmaps'
    const resp = await postRequest(dirsUrl)

    const userArr = []
    resp.data.forEach(item => {
      userArr.push(item.name)
    })
    setUsers(userArr)
    let user01 = userArr[0]
    // 如果有传hash，读取user和markmap
    if (location.hash) {
      let hash = location.hash.slice(1).split('/')
      setCurrentuser(hash[0])
      setCurrentmark(hash[1])
      syncLoadMarklist()

    } else {
      setCurrentuser(user01)
      loadMarklist(user01)
    }
  }

  async function loadMarklist(user) {
    const listUrl = 'https://box.hdcxb.net/api/fs/list?path=markmaps'
    const userFiles = (await postRequest(`${listUrl}/${user}`))?.data?.content
    const markArr = []
    userFiles.forEach(file => {
      if (file.name.indexOf('.md' != -1)) {
        markArr.push(file.name)
      }
    })
    setMarks(markArr)
  }

  const handleClick = async (filename) => {
    const fileUrl = `https://box.hdcxb.net/d/markmaps/${currentuser}/${filename}`
    const text = await textRequest(fileUrl)
    setCurrentmark(filename)
    setText(text)
  }

  const handleChange = (e) => {
    setCurrentuser(e.target.value)
    loadMarklist(e.target.value);
  }
  return (
    <>
      <div className="absolute top-1 left-1">
        <select onChange={handleChange} value={currentuser} >
          {
            users?.map(user => {
              return <option key={user} value={user}>{user}</option>
            })
          }
        </select>
        {
          marks?.map(mark => {
            { currentuser }
            return <li key={mark} className={mark == currentmark ? 'under-1' : ''}><a href={`#${currentuser}/${mark}`} onClick={() => handleClick(mark)}>{mark}</a></li>
          })
        }
      </div>

      <div className="flex flex-col h-screen p-2">
        {text && <MarkmapHooks text={text} />}
      </div>
    </>
  )
}
