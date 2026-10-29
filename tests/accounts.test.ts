import { describe,it,expect } from "vitest";
import { profileSchema,registrationSchema } from "../src/modules/accounts/validation";
describe("account input boundaries",()=>{
  const profile={displayName:"Scout User",image:"",preferredCity:"Bengaluru",seeking:true,owning:true,brokering:true};
  it("allows overlapping interests without granting capabilities",()=>expect(profileSchema.parse(profile)).toEqual(profile));
  it.each([{...profile,userId:"victim"},{...profile,role:"administrator"},{...profile,image:"https://tracker.example/avatar"},{...profile,displayName:""}])("rejects unauthorized or invalid profile fields",input=>expect(profileSchema.safeParse(input).success).toBe(false));
  it("validates registration and rejects privileged fields",()=>{
    const user={name:"Scout",email:"scout@example.test",password:"a-long-unique-password"};
    expect(registrationSchema.safeParse(user).success).toBe(true);
    for(const input of [{...user,role:"admin"},{...user,email:"bad"},{...user,password:"short"},{...user,image:"/x"}]) expect(registrationSchema.safeParse(input).success).toBe(false);
  });
});