import { Link } from 'react-router-dom';
import PageAnimator from '../components/PageAnimator'
import { useLanguage } from '../context/LanguageContext'

function WorkingOn() {
  const { t } = useLanguage();

  return (
    <PageAnimator className="relative flex min-h-[calc(100vh-76px)] w-full items-center justify-center overflow-hidden px-4 py-8">
      <div className="flex w-full max-w-5xl flex-col items-center gap-8 rounded-[2rem] border-[4px] border-black bg-surface-container-highest p-8 text-center shadow-[10px_10px_0px_0px_rgba(0,0,0,1)] backdrop-blur-sm sm:p-12">
        <div className="space-y-6">
          <div className="font-headline-lg text-[50px] uppercase leading-none text-red-700 drop-shadow-[4px_4px_0px_rgba(0,0,0,1)] sm:text-[100px]">
            {t('common.workingon')}
          </div>
          <p className="mx-auto max-w-2xl text-base leading-7 tracking-[0.02em] text-gray-400 sm:text-lg">
            {t('store.wip.desc')}
          </p>
        </div>

        <Link
          to="/"
          className="w-full max-w-[260px] rounded-2xl border-[4px] border-black bg-red-500 px-6 py-4 text-center font-headline-md text-[18px] text-white shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] transition-all hover:-translate-y-1 active:translate-x-1 active:translate-y-1 active:shadow-none"
        >
          {t('common.gohome')}
        </Link>
      </div>
    </PageAnimator>
  );
}

export default WorkingOn