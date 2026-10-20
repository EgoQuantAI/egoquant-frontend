# Deploying the EgoQuant website

The website is a standard Next.js project. We run it on Vercel; any host that runs Next.js works.

1. **Backend first.** Deploy the backend and, if you want accounts, the Supabase project, as described in the backend's [DEPLOYMENT.md](https://github.com/EgoQuantAI/egoquant-backend/blob/main/DEPLOYMENT.md).
2. **Import this repository into Vercel.** Framework: Next.js (detected). Node.js 22.
3. **Set the variables** for Production (and Preview if you use preview links):

   | Variable | Value |
   |---|---|
   | `BACKEND_URL` | the backend's URL, for example `https://web-production-59960.up.railway.app` |
   | `NEXT_PUBLIC_SUPABASE_URL` | the Supabase project URL (only with accounts) |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the Supabase anon key (only with accounts; never a service-role key) |

4. **Deploy.** A changed variable only reaches a new build, so redeploy after changing one.
5. **Supabase URL settings** (only with accounts): in Supabase, Authentication, URL Configuration, set the Site URL to the website's address and add `https://your-website/**` to the Redirect URLs. Otherwise confirmation and password-reset e-mails send people to another address.
6. **Check it.** Open the website: the questionnaire loads (the backend answers), **Verify a report** with the demo report says "Unchanged", and, with accounts, you can sign up, confirm the e-mail and build a portfolio.

Our live copy: https://www.egoquant.app, on Vercel, with the backend on Railway and accounts on Supabase.
