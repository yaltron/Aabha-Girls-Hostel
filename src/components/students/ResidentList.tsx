import type { Student } from '../../lib/students'

export function ResidentList({ students }: { students: Student[] }) {
  return (
    <div className="bg-surface-container-lowest rounded-xxl shadow-premium overflow-hidden">
      <table className="w-full text-left">
        <thead className="bg-surface-container/30 text-on-surface-variant uppercase text-xs">
          <tr>
            <th className="px-8 py-4">Name</th>
            <th className="px-8 py-4">Guardian</th>
            <th className="px-8 py-4">Guardian Phone</th>
            <th className="px-8 py-4">Monthly Fee</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/10">
          {students.map((student) => (
            <tr key={student.id}>
              <td className="px-8 py-5 font-medium text-on-surface">{student.full_name}</td>
              <td className="px-8 py-5 text-on-surface-variant">{student.guardian_name}</td>
              <td className="px-8 py-5 text-on-surface-variant">{student.guardian_phone}</td>
              <td className="px-8 py-5 text-on-surface">{student.monthly_fee}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
