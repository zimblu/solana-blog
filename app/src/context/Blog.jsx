import { createContext, useContext, useEffect, useMemo, useState } from "react";
import * as anchor from "@project-serum/anchor";
import {
  useAnchorWallet,
  useConnection,
  useWallet,
} from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { getAvatarUrl } from "src/functions/getAvatarUrl";
import { getRandomName } from "src/functions/getRandomName";
import idl from "src/idl.json";
import { findProgramAddressSync } from "@project-serum/anchor/dist/cjs/utils/pubkey";
import { utf8 } from "@project-serum/anchor/dist/cjs/utils/bytes";
import { error } from "console";

const BlogContext = createContext();

// Get Program Key
const PROGRAM_KEY = new PublicKey(idl.metadata.address);

export const useBlog = () => {
  const context = useContext(BlogContext);
  if (!context) {
    throw new Error("Parent must be wrapped inside PostsProvider");
  }

  return context;
};

export const BlogProvider = ({ children }) => {
  const [user, setUser] = useState();
  const [initialized, setInitialized] = useState(false);
  const [transactionPending, setTransactionPending] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [lastPostId, setLastPostId] = useState(0);
  const [posts, setPosts] = useState([]);

  const anchorWallet = useAnchorWallet();
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  const program = useMemo(() => {
    if (anchorWallet) {
      const provider = new anchor.AnchorProvider(
        connection,
        anchorWallet,
        anchor.AnchorProvider.defaultOptions()
      );
      return new anchor.Program(idl, PROGRAM_KEY, provider);
    }
  }, [connection, anchorWallet]);

  useEffect(() => {
    const start = async () => {
      // Check if there is a user
      // IF there is a user FETCH POSTS
      // IF NO USER set state to false (need a button to init user)
      if (program && publicKey) {
        try {
          // Check if there is a user account
          const [userPda] = await findProgramAddressSync(
            [utf8.encode("user"), publicKey.toBuffer()],
            program.programId
          );
          const user = await program.account.userAccount.fetch(userPda);
          if (user) {
            setInitialized(true); // Create Post
            setUser(user);
            setLastPostId(user.lastPostId);

            const postAccounts = await program.account.postAccount.all();
            setPosts(postAccounts);
          }
        } catch (error) {
          console.log("No User");
          setInitialized(false); // Initialize user
        }
      }
    };

    start();
  }, [program, publicKey, transactionPending]);

  const initUser = async () => {
    if (program && publicKey) {
      try {
        setTransactionPending(true);
        const [userPda] = findProgramAddressSync(
          [utf8.encode("user"), publicKey.toBuffer()],
          program.programId
        );
        const name = getRandomName();
        const avatar = getAvatarUrl(name);

        await program.methods
          .initUser(name, avatar)
          .accounts({
            userAccount: userPda,
            authority: publicKey,
            SystemProgram: SystemProgram.programId,
          })
          .rpc();
        setInitialized(true);
      } catch (error) {
        console.log(error);
      } finally {
        setTransactionPending(false);
      }
    }
  };

  const createPost = async (title, content) => {
    setTransactionPending(true);
    try {
      const [userPda] = await findProgramAddressSync(
        [utf8.encode("user"), publicKey.toBuffer()],
        program.programId
      );
      const [postPda] = await findProgramAddressSync(
        [
          utf8.encode("post"),
          publicKey.toBuffer(),
          Uint8Array.from([lastPostId]),
        ],
        program.programId
      );

      await program.methods
        .createPost(title, content)
        .accounts({
          postAccount: postPda,
          userAccount: userPda,
          authority: publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setShowModal(false);
    } catch (err) {
      console.log(err);
    } finally {
      setTransactionPending(false);
    }
  };

  return (
    <BlogContext.Provider
      value={{
        user,
        initialized,
        initUser,
        showModal,
        setShowModal,
        createPost,
        posts,
      }}
    >
      {children}
    </BlogContext.Provider>
  );
};
